import { querySnowflake } from "@/lib/snowflake"
import type { HealthStatus } from "@/lib/types"

interface StreamRow {
  name: string
  database_name: string
  schema_name: string
  table_name: string
  source_type: string
  stale: string
  stale_after: string
  type: string
  mode: string
}

export async function getStreamStatuses(database: string): Promise<
  Array<{
    fqn: string
    status: HealthStatus
    tableName: string
    sourceType: string
    stale: boolean
    staleAfter: string | null
    mode: string
  }>
> {
  const sql = `SHOW STREAMS IN DATABASE ${database}`
  const rows = (await querySnowflake(sql)) as StreamRow[]
  return rows.map((r) => ({
    fqn: `${r.database_name}.${r.schema_name}.${r.name}`,
    status: r.stale === "true" ? "error" : "healthy",
    tableName: r.table_name,
    sourceType: r.source_type,
    stale: r.stale === "true",
    staleAfter: r.stale_after ?? null,
    mode: r.mode,
  }))
}
