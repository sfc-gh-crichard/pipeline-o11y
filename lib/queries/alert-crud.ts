import { querySnowflake } from "@/lib/snowflake"
import type { AlertEvent } from "@/lib/types"
import { buildCreateAlertSql } from "./alert-templates"
import type { CreateAlertParams, MonitoredObjectCounts } from "./alert-templates"

export type { CreateAlertParams, MonitoredObjectCounts }

export interface AlertRow {
  name: string
  database_name: string
  schema_name: string
  condition: string
  action: string
  schedule: string
  state: string
  warehouse: string | null
}

export async function listAlerts(): Promise<AlertRow[]> {
  const rows = await querySnowflake("SHOW ALERTS IN ACCOUNT")
  return rows as AlertRow[]
}

export async function getAlertHistory(
  limit = 50,
): Promise<AlertEvent[]> {
  const sql = `
    SELECT
      ALERT_NAME,
      SCHEDULED_TIME,
      STATE,
      CASE
        WHEN STATE = 'TRIGGERED' THEN true
        ELSE false
      END AS CONDITION_RESULT,
      ERROR_MESSAGE AS ACTION_RESULT,
      CASE
        WHEN STATE IN ('CONDITION_FAILED','ACTION_FAILED') THEN 'emergency'
        WHEN STATE = 'TRIGGERED' THEN 'warning'
        ELSE 'info'
      END AS SEVERITY
    FROM SNOWFLAKE.ACCOUNT_USAGE.SERVERLESS_ALERT_HISTORY
    ORDER BY SCHEDULED_TIME DESC
    LIMIT ${limit}
  `
  const rows = await querySnowflake(sql)
  return rows.map((r: Record<string, unknown>) => ({
    alertName: String(r.ALERT_NAME ?? ""),
    scheduledTime: String(r.SCHEDULED_TIME ?? ""),
    state: String(r.STATE ?? ""),
    conditionResult: Boolean(r.CONDITION_RESULT),
    actionResult: r.ACTION_RESULT ? String(r.ACTION_RESULT) : null,
    severity: (r.SEVERITY as AlertEvent["severity"]) ?? "info",
  }))
}

export async function getMonitoredCounts(): Promise<MonitoredObjectCounts> {
  const dtSql = `
    SELECT
      COUNT(*) AS total,
      COUNT_IF(SCHEDULING_STATE = 'RUNNING') AS healthy,
      COUNT_IF(SCHEDULING_STATE != 'RUNNING') AS error
    FROM TABLE(INFORMATION_SCHEMA.DYNAMIC_TABLES())
  `

  let dtCounts = { total: 0, healthy: 0, error: 0 }
  let taskCounts = { total: 0, healthy: 0, error: 0 }
  let streamCounts = { total: 0, healthy: 0, stale: 0 }
  let alertCounts = { total: 0, active: 0, triggered: 0 }

  try {
    const dtRows = await querySnowflake(dtSql)
    if (dtRows[0]) {
      dtCounts = {
        total: Number(dtRows[0].TOTAL ?? 0),
        healthy: Number(dtRows[0].HEALTHY ?? 0),
        error: Number(dtRows[0].ERROR ?? 0),
      }
    }
  } catch { /* ignore */ }

  try {
    const showTasks = await querySnowflake("SHOW TASKS IN ACCOUNT")
    taskCounts = {
      total: showTasks.length,
      healthy: showTasks.filter((r: Record<string, unknown>) => r.state === "started").length,
      error: showTasks.filter((r: Record<string, unknown>) => r.state === "suspended").length,
    }
  } catch { /* ignore */ }

  try {
    const showStreams = await querySnowflake("SHOW STREAMS IN ACCOUNT")
    streamCounts = {
      total: showStreams.length,
      healthy: showStreams.filter((r: Record<string, unknown>) => r.stale === "false").length,
      stale: showStreams.filter((r: Record<string, unknown>) => r.stale === "true").length,
    }
  } catch { /* ignore */ }

  try {
    const showAlerts = await querySnowflake("SHOW ALERTS IN ACCOUNT")
    alertCounts = {
      total: showAlerts.length,
      active: showAlerts.filter((r: Record<string, unknown>) => r.state === "started").length,
      triggered: 0,
    }
  } catch { /* ignore */ }

  return {
    dynamicTables: dtCounts,
    tasks: taskCounts,
    streams: streamCounts,
    alerts: alertCounts,
  }
}

export async function createAlert(params: CreateAlertParams): Promise<void> {
  const sql = buildCreateAlertSql(params)
  const statements = sql.split(";").filter((s) => s.trim())
  for (const stmt of statements) {
    await querySnowflake(stmt)
  }
}
