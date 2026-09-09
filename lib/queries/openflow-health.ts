import { querySnowflake } from "@/lib/snowflake"
import type { HealthStatus } from "@/lib/types"

interface ConnectorRow {
  name: string
  database_name: string
  schema_name: string
  connector_type: string
  status: string
  created_on: string
}

export async function getOpenflowStatuses(): Promise<
  Array<{
    fqn: string
    name: string
    status: HealthStatus
    connectorType: string
    rawStatus: string
    createdOn: string
  }>
> {
  try {
    const sql = `SHOW OPENFLOW CONNECTORS`
    const rows = (await querySnowflake(sql)) as ConnectorRow[]
    return rows.map((r) => ({
      fqn: `${r.database_name}.${r.schema_name}.${r.name}`,
      name: r.name,
      status: deriveConnectorStatus(r.status),
      connectorType: r.connector_type,
      rawStatus: r.status,
      createdOn: r.created_on,
    }))
  } catch {
    return []
  }
}

function deriveConnectorStatus(status: string): HealthStatus {
  const s = status?.toUpperCase()
  if (s === "RUNNING" || s === "STARTED") return "healthy"
  if (s === "SUSPENDED" || s === "STOPPED") return "inactive"
  if (s === "FAILED" || s === "ERROR") return "error"
  return "warning"
}
