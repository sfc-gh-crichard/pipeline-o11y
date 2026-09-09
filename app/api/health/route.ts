import { NextResponse } from "next/server"
import { querySnowflake } from "@/lib/snowflake"
import { cached } from "@/lib/cache"
import type { HealthSummary, HealthStatus, RefreshEvent } from "@/lib/types"

export const dynamic = "force-dynamic"

const PIPELINE_DATABASES = ["LPR_POC", "CMS_POC"]
const HEALTH_TTL = 45_000 // 45s cache

function toIso(val: unknown): string | null {
  if (!val) return null
  if (val instanceof Date) return val.toISOString()
  return String(val)
}

export async function GET() {
  try {
    const summary = await cached("health-summary", HEALTH_TTL, fetchHealthSummary)
    return NextResponse.json(summary)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

async function fetchHealthSummary(): Promise<HealthSummary> {
    const objectStatus: Record<string, { type: string; status: HealthStatus }> = {}
    const dtRefreshRows: Record<string, any>[] = []

    // Query DT metadata (current state), task state, and streams in parallel
    const [dtInfoRows, ...dbResults] = await Promise.all([
      // DT metadata is global — one call gets all
      querySnowflake(`
        SELECT NAME, SCHEMA_NAME, DATABASE_NAME, QUALIFIED_NAME,
               SCHEDULING_STATE, LAST_COMPLETED_REFRESH_STATE,
               TIME_WITHIN_TARGET_LAG_RATIO
        FROM TABLE(${PIPELINE_DATABASES[0]}.INFORMATION_SCHEMA.DYNAMIC_TABLES())
      `).catch(() => []) as Promise<Record<string, any>[]>,

      // Per-database: tasks (SHOW for current state), streams, DT refresh history
      ...PIPELINE_DATABASES.map(async (db) => {
        const [tasks, streams, dtRefreshes] = await Promise.all([
          querySnowflake(`SHOW TASKS IN DATABASE ${db}`).catch(() => []),
          querySnowflake(`SHOW STREAMS IN DATABASE ${db}`).catch(() => []),
          querySnowflake(`
            SELECT NAME, DATABASE_NAME AS "database", SCHEMA_NAME AS "schema",
                   REFRESH_ACTION, STATE, STATE_MESSAGE,
                   REFRESH_START_TIME, REFRESH_END_TIME,
                   TIMESTAMPDIFF('MILLISECOND', REFRESH_START_TIME, REFRESH_END_TIME) AS DURATION_MS,
                   NVL(STATISTICS:insertedRowCount, 0)::INT AS ROWS_INSERTED,
                   NVL(STATISTICS:deletedRowCount, 0)::INT AS ROWS_DELETED
            FROM TABLE(${db}.INFORMATION_SCHEMA.DYNAMIC_TABLE_REFRESH_HISTORY(
              DATA_TIMESTAMP_START => DATEADD('DAY', -7, CURRENT_TIMESTAMP())
            ))
            ORDER BY REFRESH_START_TIME DESC
            LIMIT 100
          `).catch(() => []),
        ])
        return { tasks, streams, dtRefreshes }
      }),
    ])

    // DTs from INFORMATION_SCHEMA — current scheduling state (deduplicated by FQN)
    for (const r of dtInfoRows as Record<string, any>[]) {
      const fqn = r.QUALIFIED_NAME ?? `${r.DATABASE_NAME}.${r.SCHEMA_NAME}.${r.NAME}`
      let schedState = ""
      try {
        const parsed = typeof r.SCHEDULING_STATE === "object"
          ? r.SCHEDULING_STATE
          : JSON.parse(r.SCHEDULING_STATE || "{}")
        schedState = parsed?.state ?? ""
      } catch { schedState = "" }

      let status: HealthStatus = "unknown"
      if (schedState === "SUSPENDED") status = "error"
      else if (r.LAST_COMPLETED_REFRESH_STATE === "FAILED" || r.LAST_COMPLETED_REFRESH_STATE === "UPSTREAM_FAILED") status = "error"
      else if (r.TIME_WITHIN_TARGET_LAG_RATIO != null && Number(r.TIME_WITHIN_TARGET_LAG_RATIO) < 0.9) status = "warning"
      else if (schedState === "ACTIVE") status = "healthy"

      objectStatus[fqn] = { type: "DYNAMIC_TABLE", status }
    }

    // Tasks from SHOW — current state (not historical runs)
    for (const result of dbResults) {
      const { tasks, streams, dtRefreshes } = result as {
        tasks: Record<string, any>[]
        streams: Record<string, any>[]
        dtRefreshes: Record<string, any>[]
      }

      for (const r of tasks) {
        const fqn = `${r.database_name}.${r.schema_name}.${r.name}`
        const state = String(r.state ?? "").toLowerCase()
        objectStatus[fqn] = {
          type: "TASK",
          status: state === "started" ? "healthy" : state === "suspended" ? "inactive" : "warning",
        }
      }

      for (const r of streams) {
        const fqn = `${r.database_name}.${r.schema_name}.${r.name}`
        const stale = String(r.stale ?? "false").toLowerCase() === "true"
        objectStatus[fqn] = { type: "STREAM", status: stale ? "warning" : "healthy" }
      }

      dtRefreshRows.push(...dtRefreshes)
    }

    const entries = Object.values(objectStatus)
    const healthyCount = entries.filter((e) => e.status === "healthy").length
    const warningCount = entries.filter((e) => e.status === "warning").length
    const errorCount = entries.filter((e) => e.status === "error").length
    const inactiveCount = entries.filter((e) => e.status === "inactive").length

    const byType: Record<string, { total: number; healthy: number; error: number }> = {}
    for (const e of entries) {
      if (!byType[e.type]) byType[e.type] = { total: 0, healthy: 0, error: 0 }
      byType[e.type].total++
      if (e.status === "healthy") byType[e.type].healthy++
      if (e.status === "error") byType[e.type].error++
    }

    const recentFailures: RefreshEvent[] = (dtRefreshRows as Record<string, any>[])
      .filter((r) => String(r.STATE ?? "").toUpperCase() === "FAILED")
      .slice(0, 10)
      .map((r) => ({
        name: r.NAME,
        database: r.database,
        schema: r.schema,
        state: "FAILED" as const,
        stateMessage: r.STATE_MESSAGE ?? null,
        refreshAction: r.REFRESH_ACTION ?? null,
        startedAt: toIso(r.REFRESH_START_TIME) ?? "",
        completedAt: toIso(r.REFRESH_END_TIME) ?? "",
        durationMs: Number(r.DURATION_MS ?? 0),
        rowsInserted: Number(r.ROWS_INSERTED ?? 0),
        rowsDeleted: Number(r.ROWS_DELETED ?? 0),
      }))

    const summary: HealthSummary = {
      totalObjects: entries.length,
      healthyCount,
      warningCount,
      errorCount,
      inactiveCount,
      byType,
      recentFailures,
    }

    return summary
}
