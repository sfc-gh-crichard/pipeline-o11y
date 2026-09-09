import { querySnowflake } from "@/lib/snowflake"

export interface Anomaly {
  objectFqn: string
  objectName: string
  objectType: string
  anomalyType: "slow_refresh" | "row_count_drop" | "row_count_spike" | "lag_degradation" | "new_failures"
  severity: "info" | "warning" | "critical"
  message: string
  currentValue: number
  baselineValue: number
  deviationPct: number
  detectedAt: string
}

const PIPELINE_DATABASES = ["LPR_POC", "CMS_POC"]

export async function detectAnomalies(): Promise<Anomaly[]> {
  const anomalies: Anomaly[] = []
  const now = new Date().toISOString()

  for (const db of PIPELINE_DATABASES) {
    // Detect slow refreshes: compare latest refresh duration to 7-day avg
    const refreshRows = await querySnowflake(`
      WITH refresh_stats AS (
        SELECT
          QUALIFIED_NAME AS fqn,
          NAME,
          TIMESTAMPDIFF('MILLISECOND', REFRESH_START_TIME, REFRESH_END_TIME) AS duration_ms,
          AVG(TIMESTAMPDIFF('MILLISECOND', REFRESH_START_TIME, REFRESH_END_TIME))
            OVER (PARTITION BY QUALIFIED_NAME ORDER BY REFRESH_START_TIME
                  ROWS BETWEEN 20 PRECEDING AND 1 PRECEDING) AS avg_duration_ms,
          ROW_NUMBER() OVER (PARTITION BY QUALIFIED_NAME ORDER BY REFRESH_START_TIME DESC) AS rn
        FROM TABLE(${db}.INFORMATION_SCHEMA.DYNAMIC_TABLE_REFRESH_HISTORY(
          DATA_TIMESTAMP_START => DATEADD('DAY', -7, CURRENT_TIMESTAMP())
        ))
        WHERE STATE = 'SUCCEEDED'
      )
      SELECT fqn, NAME, duration_ms, avg_duration_ms
      FROM refresh_stats
      WHERE rn = 1
        AND avg_duration_ms > 0
        AND duration_ms > avg_duration_ms * 2
        AND duration_ms > 5000
    `).catch(() => []) as Record<string, any>[]

    for (const r of refreshRows) {
      const currentMs = Number(r.DURATION_MS ?? r.duration_ms ?? 0)
      const avgMs = Number(r.AVG_DURATION_MS ?? r.avg_duration_ms ?? 1)
      const pct = Math.round(((currentMs - avgMs) / avgMs) * 100)
      anomalies.push({
        objectFqn: r.FQN ?? r.fqn,
        objectName: r.NAME ?? r.name,
        objectType: "DYNAMIC_TABLE",
        anomalyType: "slow_refresh",
        severity: pct > 500 ? "critical" : pct > 200 ? "warning" : "info",
        message: `Last refresh took ${formatDuration(currentMs)}, ${pct}% slower than the ${formatDuration(avgMs)} average`,
        currentValue: currentMs,
        baselineValue: avgMs,
        deviationPct: pct,
        detectedAt: now,
      })
    }

    // Detect row count changes: compare current row count to the count from 24h ago
    const rowRows = await querySnowflake(`
      WITH current_state AS (
        SELECT
          QUALIFIED_NAME AS fqn,
          NAME,
          NVL(STATISTICS:insertedRowCount, 0)::INT AS rows_inserted,
          NVL(STATISTICS:deletedRowCount, 0)::INT AS rows_deleted,
          ROW_NUMBER() OVER (PARTITION BY QUALIFIED_NAME ORDER BY REFRESH_START_TIME DESC) AS rn
        FROM TABLE(${db}.INFORMATION_SCHEMA.DYNAMIC_TABLE_REFRESH_HISTORY(
          DATA_TIMESTAMP_START => DATEADD('DAY', -7, CURRENT_TIMESTAMP())
        ))
        WHERE STATE = 'SUCCEEDED'
      ),
      avg_rows AS (
        SELECT
          QUALIFIED_NAME AS fqn,
          AVG(NVL(STATISTICS:insertedRowCount, 0)::INT) AS avg_inserted
        FROM TABLE(${db}.INFORMATION_SCHEMA.DYNAMIC_TABLE_REFRESH_HISTORY(
          DATA_TIMESTAMP_START => DATEADD('DAY', -7, CURRENT_TIMESTAMP())
        ))
        WHERE STATE = 'SUCCEEDED'
        GROUP BY QUALIFIED_NAME
        HAVING COUNT(*) >= 3
      )
      SELECT c.fqn, c.NAME, c.rows_inserted, a.avg_inserted
      FROM current_state c
      JOIN avg_rows a ON c.fqn = a.fqn
      WHERE c.rn = 1
        AND a.avg_inserted > 10
        AND (c.rows_inserted < a.avg_inserted * 0.5 OR c.rows_inserted > a.avg_inserted * 3)
    `).catch(() => []) as Record<string, any>[]

    for (const r of rowRows) {
      const current = Number(r.ROWS_INSERTED ?? r.rows_inserted ?? 0)
      const avg = Number(r.AVG_INSERTED ?? r.avg_inserted ?? 1)
      const isSpike = current > avg
      const pct = Math.round(Math.abs(((current - avg) / avg) * 100))
      anomalies.push({
        objectFqn: r.FQN ?? r.fqn,
        objectName: r.NAME ?? r.name,
        objectType: "DYNAMIC_TABLE",
        anomalyType: isSpike ? "row_count_spike" : "row_count_drop",
        severity: pct > 80 ? "warning" : "info",
        message: isSpike
          ? `Inserted ${current.toLocaleString()} rows, ${pct}% more than the ${Math.round(avg).toLocaleString()} average`
          : `Only inserted ${current.toLocaleString()} rows, ${pct}% fewer than the ${Math.round(avg).toLocaleString()} average`,
        currentValue: current,
        baselineValue: avg,
        deviationPct: pct,
        detectedAt: now,
      })
    }
  }

  // Detect suspended DTs — a suspended pipeline is always worth surfacing
  const suspendedRows = await querySnowflake(`
    SELECT NAME, DATABASE_NAME, SCHEMA_NAME, QUALIFIED_NAME, SCHEDULING_STATE
    FROM TABLE(${PIPELINE_DATABASES[0]}.INFORMATION_SCHEMA.DYNAMIC_TABLES())
    WHERE SCHEDULING_STATE:state::STRING = 'SUSPENDED'
  `).catch(() => []) as Record<string, any>[]

  for (const r of suspendedRows) {
    const fqn = r.QUALIFIED_NAME ?? `${r.DATABASE_NAME}.${r.SCHEMA_NAME}.${r.NAME}`
    let reason = "suspended"
    try {
      const parsed = typeof r.SCHEDULING_STATE === "object"
        ? r.SCHEDULING_STATE
        : JSON.parse(String(r.SCHEDULING_STATE))
      if (parsed?.reason_code === "USER_SUSPENDED") reason = "manually suspended by a user"
      else if (parsed?.reason_message) reason = parsed.reason_message
    } catch { /* keep default */ }

    anomalies.push({
      objectFqn: fqn,
      objectName: r.NAME,
      objectType: "DYNAMIC_TABLE",
      anomalyType: "new_failures",
      severity: "critical",
      message: `Pipeline stopped — dynamic table is ${reason}. Downstream objects are stale.`,
      currentValue: 0,
      baselineValue: 1,
      deviationPct: 100,
      detectedAt: now,
    })
  }

  // Detect DTs with lag ratio below 95% — early warning before SLA breach
  const lagRows = await querySnowflake(`
    SELECT NAME, DATABASE_NAME, SCHEMA_NAME, QUALIFIED_NAME, 
           TIME_WITHIN_TARGET_LAG_RATIO, TARGET_LAG_SEC
    FROM TABLE(${PIPELINE_DATABASES[0]}.INFORMATION_SCHEMA.DYNAMIC_TABLES())
    WHERE SCHEDULING_STATE:state::STRING = 'ACTIVE'
      AND TIME_WITHIN_TARGET_LAG_RATIO IS NOT NULL
      AND TIME_WITHIN_TARGET_LAG_RATIO < 0.95
  `).catch(() => []) as Record<string, any>[]

  for (const r of lagRows) {
    const fqn = r.QUALIFIED_NAME ?? `${r.DATABASE_NAME}.${r.SCHEMA_NAME}.${r.NAME}`
    const ratio = Number(r.TIME_WITHIN_TARGET_LAG_RATIO ?? 0)
    const pct = Math.round(ratio * 100)
    anomalies.push({
      objectFqn: fqn,
      objectName: r.NAME,
      objectType: "DYNAMIC_TABLE",
      anomalyType: "lag_degradation",
      severity: pct < 80 ? "critical" : "warning",
      message: `Only meeting target lag ${pct}% of the time (target: ${r.TARGET_LAG_SEC}s). Data freshness is degrading.`,
      currentValue: pct,
      baselineValue: 100,
      deviationPct: 100 - pct,
      detectedAt: now,
    })
  }

  return anomalies.sort((a, b) => {
    const sev = { critical: 0, warning: 1, info: 2 }
    return (sev[a.severity] ?? 2) - (sev[b.severity] ?? 2)
  })
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60_000).toFixed(1)}m`
}
