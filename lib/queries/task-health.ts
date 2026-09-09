import { querySnowflake } from "@/lib/snowflake"
import type { TaskRun, HealthStatus } from "@/lib/types"

interface TaskStatusRow {
  name: string
  database_name: string
  schema_name: string
  state: string
  condition: string
  schedule: string
}

export async function getTaskStatuses(database: string): Promise<
  Array<{
    fqn: string
    status: HealthStatus
    state: string
    schedule: string
  }>
> {
  const sql = `SHOW TASKS IN DATABASE ${database}`
  const rows = (await querySnowflake(sql)) as TaskStatusRow[]
  return rows.map((r) => ({
    fqn: `${r.database_name}.${r.schema_name}.${r.name}`,
    status: deriveTaskStatus(r.state),
    state: r.state,
    schedule: r.schedule,
  }))
}

function deriveTaskStatus(state: string): HealthStatus {
  if (state === "started") return "healthy"
  if (state === "suspended") return "inactive"
  return "warning"
}

export async function getTaskRunHistory(
  database: string,
  name?: string,
): Promise<TaskRun[]> {
  const nameFilter = name ? `AND NAME = '${name}'` : ""
  const sql = `
    SELECT
      NAME,
      DATABASE_NAME,
      SCHEMA_NAME,
      STATE,
      ERROR_CODE,
      ERROR_MESSAGE,
      SCHEDULED_TIME,
      COMPLETED_TIME,
      TIMESTAMPDIFF('MILLISECOND', SCHEDULED_TIME, COALESCE(COMPLETED_TIME, CURRENT_TIMESTAMP())) AS DURATION_MS,
      QUERY_ID
    FROM TABLE(${database}.INFORMATION_SCHEMA.TASK_HISTORY(
      SCHEDULED_TIME_RANGE_START => DATEADD('DAY', -7, CURRENT_TIMESTAMP()),
      RESULT_LIMIT => 200
    ))
    WHERE 1=1 ${nameFilter}
    ORDER BY SCHEDULED_TIME DESC
  `
  const rows = (await querySnowflake(sql)) as Array<Record<string, any>>
  return rows.map((r) => ({
    name: r.NAME,
    database: r.DATABASE_NAME,
    schema: r.SCHEMA_NAME,
    state: r.STATE,
    errorCode: r.ERROR_CODE ?? null,
    errorMessage: r.ERROR_MESSAGE ?? null,
    scheduledTime: r.SCHEDULED_TIME,
    completedTime: r.COMPLETED_TIME ?? null,
    durationMs: r.DURATION_MS ?? null,
    queryId: r.QUERY_ID ?? null,
  }))
}
