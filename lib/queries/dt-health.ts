import { querySnowflake } from "@/lib/snowflake"
import type { RefreshEvent, HealthStatus } from "@/lib/types"

interface DTStatusRow {
  NAME: string
  DATABASE_NAME: string
  SCHEMA_NAME: string
  SCHEDULING_STATE: string
  LAST_REFRESH_STATE: string | null
  LAST_REFRESH_STATE_MESSAGE: string | null
  DATA_TIMESTAMP: string | null
  TARGET_LAG: string | null
  ROWS: number | null
}

export async function getDTStatuses(database: string): Promise<
  Array<{
    fqn: string
    status: HealthStatus
    schedulingState: string
    lastRefreshState: string | null
    errorMessage: string | null
    targetLag: string | null
    rowCount: number | null
    dataTimestamp: string | null
  }>
> {
  const sql = `
    SELECT
      NAME,
      DATABASE_NAME,
      SCHEMA_NAME,
      SCHEDULING_STATE,
      LAST_COMPLETED_REFRESH:state::STRING AS LAST_REFRESH_STATE,
      LAST_COMPLETED_REFRESH:state_message::STRING AS LAST_REFRESH_STATE_MESSAGE,
      DATA_TIMESTAMP,
      TARGET_LAG,
      ROWS
    FROM TABLE(${database}.INFORMATION_SCHEMA.DYNAMIC_TABLES())
  `
  const rows = (await querySnowflake(sql)) as DTStatusRow[]
  return rows.map((r) => ({
    fqn: `${r.DATABASE_NAME}.${r.SCHEMA_NAME}.${r.NAME}`,
    status: deriveDTStatus(r.SCHEDULING_STATE, r.LAST_REFRESH_STATE),
    schedulingState: r.SCHEDULING_STATE,
    lastRefreshState: r.LAST_REFRESH_STATE,
    errorMessage: r.LAST_REFRESH_STATE_MESSAGE,
    targetLag: r.TARGET_LAG,
    rowCount: r.ROWS,
    dataTimestamp: r.DATA_TIMESTAMP,
  }))
}

function deriveDTStatus(scheduling: string, lastRefresh: string | null): HealthStatus {
  if (scheduling === "SUSPENDED") return "inactive"
  if (lastRefresh === "FAILED" || lastRefresh === "UPSTREAM_FAILED") return "error"
  if (scheduling === "RUNNING" && lastRefresh === "SUCCEEDED") return "healthy"
  if (scheduling === "RUNNING") return "warning"
  return "unknown"
}

export async function getDTRefreshHistory(
  database: string,
  name?: string,
): Promise<RefreshEvent[]> {
  const nameFilter = name ? `AND NAME = '${name}'` : ""
  const sql = `
    SELECT
      NAME,
      DATABASE_NAME AS "database",
      SCHEMA_NAME AS "schema",
      STATE,
      STATE_MESSAGE,
      REFRESH_ACTION,
      REFRESH_TRIGGER,
      REFRESH_START_TIME,
      REFRESH_END_TIME,
      TIMESTAMPDIFF('MILLISECOND', REFRESH_START_TIME, REFRESH_END_TIME) AS DURATION_MS,
      STATISTICS:insertedRowCount::NUMBER AS ROWS_INSERTED,
      STATISTICS:deletedRowCount::NUMBER AS ROWS_DELETED
    FROM TABLE(${database}.INFORMATION_SCHEMA.DYNAMIC_TABLE_REFRESH_HISTORY(
      DATA_TIMESTAMP_START => DATEADD('DAY', -7, CURRENT_TIMESTAMP())
    ))
    WHERE 1=1 ${nameFilter}
    ORDER BY REFRESH_START_TIME DESC
    LIMIT 200
  `
  const rows = (await querySnowflake(sql)) as Array<Record<string, any>>
  return rows.map((r) => ({
    name: r.NAME,
    database: r.database,
    schema: r.schema,
    state: r.STATE,
    stateMessage: r.STATE_MESSAGE ?? null,
    refreshAction: r.REFRESH_ACTION ?? null,
    startedAt: r.REFRESH_START_TIME,
    completedAt: r.REFRESH_END_TIME,
    durationMs: r.DURATION_MS ?? 0,
    rowsInserted: r.ROWS_INSERTED ?? 0,
    rowsDeleted: r.ROWS_DELETED ?? 0,
  }))
}
