export interface MonitoredObjectCounts {
  dynamicTables: { total: number; healthy: number; error: number }
  tasks: { total: number; healthy: number; error: number }
  streams: { total: number; healthy: number; stale: number }
  alerts: { total: number; active: number; triggered: number }
}

export interface CreateAlertParams {
  name: string
  database: string
  schema: string
  warehouse: string | null
  schedule: string
  conditionSql: string
  actionSql: string
}

export function buildCreateAlertSql(params: CreateAlertParams): string {
  const fqn = `${params.database}.${params.schema}.${params.name}`
  const warehouseLine = params.warehouse
    ? `\n  WAREHOUSE = ${params.warehouse}`
    : ""
  return `CREATE OR REPLACE ALERT ${fqn}${warehouseLine}
  SCHEDULE = '${params.schedule}'
  IF (EXISTS (${params.conditionSql}))
  THEN ${params.actionSql};

ALTER ALERT ${fqn} RESUME;`
}

export interface ConditionTemplate {
  label: string
  objectType: string
  buildCondition: (objectFqn: string, threshold?: string) => string
  buildAction: (email: string, objectFqn: string) => string
  thresholdLabel?: string
  thresholdDefault?: string
}

export const CONDITION_TEMPLATES: ConditionTemplate[] = [
  {
    label: "DT is not active (suspended or failed)",
    objectType: "DYNAMIC_TABLE",
    buildCondition: (fqn) =>
      `SELECT 1 FROM TABLE(INFORMATION_SCHEMA.DYNAMIC_TABLES()) WHERE QUALIFIED_NAME = '${fqn}' AND SCHEDULING_STATE:state::STRING != 'ACTIVE'`,
    buildAction: (email, fqn) =>
      `CALL SYSTEM$SEND_EMAIL('o11y_alerts', '${email}', 'Alert: ${fqn} not active', 'Dynamic table ${fqn} is no longer active. Check if it was suspended or failed.')`,
  },
  {
    label: "DT refresh failed",
    objectType: "DYNAMIC_TABLE",
    buildCondition: (fqn) =>
      `SELECT 1 FROM TABLE(INFORMATION_SCHEMA.DYNAMIC_TABLE_REFRESH_HISTORY('${fqn}')) WHERE STATE = 'FAILED' AND REFRESH_END_TIME > DATEADD('minute', -60, CURRENT_TIMESTAMP())`,
    buildAction: (email, fqn) =>
      `CALL SYSTEM$SEND_EMAIL('o11y_alerts', '${email}', 'Alert: ${fqn} refresh failed', 'Dynamic table ${fqn} had a failed refresh in the last 60 minutes.')`,
  },
  {
    label: "DT falling behind target lag",
    objectType: "DYNAMIC_TABLE",
    thresholdLabel: "Min % in target (default 90)",
    thresholdDefault: "90",
    buildCondition: (fqn, threshold = "90") =>
      `SELECT 1 FROM TABLE(INFORMATION_SCHEMA.DYNAMIC_TABLES()) WHERE QUALIFIED_NAME = '${fqn}' AND TIME_WITHIN_TARGET_LAG_RATIO < ${Number(threshold) / 100}`,
    buildAction: (email, fqn) =>
      `CALL SYSTEM$SEND_EMAIL('o11y_alerts', '${email}', 'Alert: ${fqn} lag degradation', 'Dynamic table ${fqn} is falling behind its target lag SLA.')`,
  },
  {
    label: "Task execution failed",
    objectType: "TASK",
    buildCondition: (fqn) =>
      `SELECT 1 FROM TABLE(INFORMATION_SCHEMA.TASK_HISTORY()) WHERE NAME = '${fqn.split(".").pop()}' AND STATE = 'FAILED' AND SCHEDULED_TIME > DATEADD('minute', -60, CURRENT_TIMESTAMP())`,
    buildAction: (email, fqn) =>
      `CALL SYSTEM$SEND_EMAIL('o11y_alerts', '${email}', 'Alert: ${fqn} failed', 'Task ${fqn} failed in the last 60 minutes.')`,
  },
  {
    label: "Task execution too slow",
    objectType: "TASK",
    thresholdLabel: "Max duration (minutes)",
    thresholdDefault: "30",
    buildCondition: (fqn, threshold = "30") =>
      `SELECT 1 FROM TABLE(INFORMATION_SCHEMA.TASK_HISTORY()) WHERE NAME = '${fqn.split(".").pop()}' AND STATE = 'SUCCEEDED' AND DATEDIFF('minute', SCHEDULED_TIME, COMPLETED_TIME) > ${threshold} AND SCHEDULED_TIME > DATEADD('hour', -2, CURRENT_TIMESTAMP())`,
    buildAction: (email, fqn) =>
      `CALL SYSTEM$SEND_EMAIL('o11y_alerts', '${email}', 'Alert: ${fqn} slow', 'Task ${fqn} exceeded duration threshold.')`,
  },
  {
    label: "Stream went stale",
    objectType: "STREAM",
    buildCondition: (fqn) => {
      const parts = fqn.split(".")
      return `SELECT 1 FROM TABLE(FLATTEN(INPUT => PARSE_JSON(SYSTEM$SHOW_STREAMS('${parts[0]}', '${parts[1]}')))) WHERE VALUE:name::STRING = '${parts[2]}' AND VALUE:stale::BOOLEAN = TRUE`
    },
    buildAction: (email, fqn) =>
      `CALL SYSTEM$SEND_EMAIL('o11y_alerts', '${email}', 'Alert: ${fqn} stale', 'Stream ${fqn} has become stale.')`,
  },
]
