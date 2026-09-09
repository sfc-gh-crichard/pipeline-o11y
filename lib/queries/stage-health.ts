import { querySnowflake } from "@/lib/snowflake"
import type { HealthStatus } from "@/lib/types"

export async function getStageStatuses(
  stages: Array<{ database: string; schema: string; name: string }>,
): Promise<
  Array<{
    fqn: string
    status: HealthStatus
    fileCount: number
    lastModified: string | null
  }>
> {
  const results: Array<{
    fqn: string
    status: HealthStatus
    fileCount: number
    lastModified: string | null
  }> = []

  for (const stage of stages) {
    const fqn = `${stage.database}.${stage.schema}.${stage.name}`
    try {
      const sql = `
        SELECT
          COUNT(*) AS FILE_COUNT,
          MAX(LAST_MODIFIED) AS LAST_MODIFIED
        FROM DIRECTORY(@${fqn})
      `
      const rows = (await querySnowflake(sql)) as Array<{
        FILE_COUNT: number
        LAST_MODIFIED: string | null
      }>
      const row = rows[0]
      const fileCount = row?.FILE_COUNT ?? 0
      const lastModified = row?.LAST_MODIFIED ?? null
      results.push({
        fqn,
        status: fileCount > 0 ? "healthy" : "warning",
        fileCount,
        lastModified,
      })
    } catch {
      results.push({ fqn, status: "unknown", fileCount: 0, lastModified: null })
    }
  }
  return results
}
