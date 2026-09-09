import { NextResponse } from "next/server"
import { querySnowflake } from "@/lib/snowflake"
import { TAG_FQN, TAG_DATABASE, TAG_SCHEMA, DEFAULT_TAG } from "@/lib/constants"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const taggedRows = await querySnowflake(`
      SELECT
        OBJECT_DATABASE, OBJECT_SCHEMA, OBJECT_NAME,
        DOMAIN AS OBJECT_TYPE, TAG_VALUE
      FROM TABLE(
        INFORMATION_SCHEMA.TAG_REFERENCES_ALL_COLUMNS(
          '${TAG_FQN}', 'TABLE'
        )
      )
      ORDER BY OBJECT_DATABASE, OBJECT_SCHEMA, OBJECT_NAME
    `).catch(() => [] as Record<string, any>[])

    return NextResponse.json({
      tag: {
        database: TAG_DATABASE,
        schema: TAG_SCHEMA,
        name: DEFAULT_TAG,
        fqn: TAG_FQN,
      },
      taggedObjects: taggedRows.map((r) => ({
        database: r.OBJECT_DATABASE,
        schema: r.OBJECT_SCHEMA,
        name: r.OBJECT_NAME,
        objectType: r.OBJECT_TYPE,
        tagValue: r.TAG_VALUE,
      })),
      taggedCount: taggedRows.length,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
