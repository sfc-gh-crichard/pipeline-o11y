import { querySnowflake } from "@/lib/snowflake"
import type { AlertEvent, AlertConfig } from "@/lib/types"

export async function getAlertHistory(limit = 100): Promise<AlertEvent[]> {
  const sql = `
    SELECT
      ALERT_NAME,
      SCHEDULED_TIME,
      STATE,
      CONDITION_RESULT,
      ACTION_RESULT,
      ALERT_ID
    FROM SNOWFLAKE.ACCOUNT_USAGE.SERVERLESS_ALERT_HISTORY
    WHERE SCHEDULED_TIME >= DATEADD('DAY', -30, CURRENT_TIMESTAMP())
    ORDER BY SCHEDULED_TIME DESC
    LIMIT ${limit}
  `
  const rows = (await querySnowflake(sql)) as Array<Record<string, any>>
  return rows.map((r) => ({
    alertName: r.ALERT_NAME,
    scheduledTime: r.SCHEDULED_TIME,
    state: r.STATE,
    conditionResult: r.CONDITION_RESULT === true || r.CONDITION_RESULT === "true",
    actionResult: r.ACTION_RESULT ?? null,
    severity: deriveSeverity(r.STATE, r.CONDITION_RESULT),
  }))
}

function deriveSeverity(
  state: string,
  conditionResult: boolean | string,
): "emergency" | "warning" | "info" {
  if (state === "CONDITION_FAILED" || state === "ACTION_FAILED") return "emergency"
  if (conditionResult === true || conditionResult === "true") return "warning"
  return "info"
}

export async function getAlerts(database: string): Promise<
  Array<{
    name: string
    database: string
    schema: string
    condition: string
    action: string
    schedule: string
    state: string
  }>
> {
  const sql = `SHOW ALERTS IN DATABASE ${database}`
  const rows = (await querySnowflake(sql)) as Array<Record<string, any>>
  return rows.map((r) => ({
    name: r.name,
    database: r.database_name,
    schema: r.schema_name,
    condition: r.condition ?? "",
    action: r.action ?? "",
    schedule: r.schedule ?? "",
    state: r.state ?? "unknown",
  }))
}

export interface CreateAlertParams {
  name: string
  database: string
  schema: string
  warehouse: string | null
  schedule: string
  condition: string
  action: string
}

export function buildCreateAlertSQL(params: CreateAlertParams): string {
  const fqn = `${params.database}.${params.schema}.${params.name}`
  const compute = params.warehouse
    ? `WAREHOUSE = ${params.warehouse}`
    : "SERVERLESS"
  return `
CREATE OR REPLACE ALERT ${fqn}
  ${compute}
  SCHEDULE = '${params.schedule}'
  IF (EXISTS (${params.condition}))
  THEN ${params.action};

ALTER ALERT ${fqn} RESUME;
  `.trim()
}

export async function createAlert(params: CreateAlertParams): Promise<void> {
  const sql = buildCreateAlertSQL(params)
  const statements = sql.split(";").filter((s) => s.trim())
  for (const stmt of statements) {
    await querySnowflake(stmt)
  }
}

export async function suspendAlert(database: string, schema: string, name: string): Promise<void> {
  await querySnowflake(`ALTER ALERT ${database}.${schema}.${name} SUSPEND`)
}

export async function resumeAlert(database: string, schema: string, name: string): Promise<void> {
  await querySnowflake(`ALTER ALERT ${database}.${schema}.${name} RESUME`)
}

export async function dropAlert(database: string, schema: string, name: string): Promise<void> {
  await querySnowflake(`DROP ALERT IF EXISTS ${database}.${schema}.${name}`)
}
