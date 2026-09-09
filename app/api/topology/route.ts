import { querySnowflake } from "@/lib/snowflake"
import { getFullTopology } from "@/lib/queries/topology"
import { TAG_DATABASE, TAG_SCHEMA } from "@/lib/constants"
import { cached } from "@/lib/cache"

export const dynamic = "force-dynamic"

const PIPELINE_DATABASES = ["LPR_POC", "CMS_POC"]
const TOPOLOGY_TTL = 60_000   // 60s cache for the full topology
const COLUMNS_TTL = 300_000   // 5 min cache for column metadata (rarely changes)

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get("action")

    if (action === "columns") {
      const database = searchParams.get("database")
      const schema = searchParams.get("schema")
      const name = searchParams.get("name")
      if (!database || !schema || !name) {
        return Response.json({ error: "database, schema, and name required" }, { status: 400 })
      }
      const cols = await cached(`columns:${database}.${schema}.${name}`, COLUMNS_TTL, () =>
        querySnowflake(`
          SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COMMENT
          FROM ${database}.INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
          ORDER BY ORDINAL_POSITION
        `, { binds: [schema, name] })
      )
      return Response.json(cols)
    }

    const dbParam = searchParams.get("databases")
    const databases = dbParam ? dbParam.split(",") : PIPELINE_DATABASES
    const cacheKey = `topology:${databases.join(",")}`

    const topology = await cached(cacheKey, TOPOLOGY_TTL, () =>
      getFullTopology(databases, TAG_DATABASE, TAG_SCHEMA)
    )
    return Response.json(topology)
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error"
    return Response.json({ error: message }, { status: 500 })
  }
}
