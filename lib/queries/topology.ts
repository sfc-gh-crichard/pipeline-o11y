import { querySnowflake } from "@/lib/snowflake"
import type { PipelineObject, PipelineEdge, ObjectType, HealthStatus } from "@/lib/types"

const EXCLUDED_SCHEMAS = new Set(["OPS", "TRUTH", "APP", "INFORMATION_SCHEMA"])

function toIsoStr(val: unknown): string | null {
  if (!val) return null
  if (val instanceof Date) return val.toISOString()
  const s = String(val).replace(/^"+|"+$/g, "")
  if (!s || s === "null" || s === "None") return null
  return s
}

interface DTMeta {
  fqn: string
  rows: number | null
  bytes: number | null
  targetLag: string | null
  targetLagSec: number | null
  lagRatio: number | null
  schedulingState: string
  lastRefreshState: string | null
  refreshMode: string | null
  dataTimestamp: string | null
}

function deriveDTStatus(meta: DTMeta): { status: HealthStatus; reason: string | null } {
  let sched = ""
  let reasonMsg: string | null = null
  let reasonCode: string | null = null
  try {
    const parsed = typeof meta.schedulingState === "string"
      ? JSON.parse(meta.schedulingState)
      : meta.schedulingState
    sched = parsed?.state ?? ""
    reasonMsg = parsed?.reason_message ?? null
    reasonCode = parsed?.reason_code ?? null
  } catch {
    sched = String(meta.schedulingState ?? "")
  }

  if (sched === "SUSPENDED") {
    const reason = reasonCode === "USER_SUSPENDED"
      ? "Manually suspended by a user"
      : reasonMsg ?? "Dynamic table is suspended"
    return { status: "error", reason }
  }
  if (meta.lastRefreshState === "FAILED") return { status: "error", reason: "Last refresh failed" }
  if (meta.lastRefreshState === "UPSTREAM_FAILED") return { status: "error", reason: "Upstream dependency failed" }
  if (meta.lagRatio != null && meta.lagRatio < 0.9) return { status: "warning", reason: `Only ${(meta.lagRatio * 100).toFixed(0)}% of time within target lag` }
  if (sched === "ACTIVE" && meta.lastRefreshState === "SUCCEEDED") return { status: "healthy", reason: null }
  if (sched === "ACTIVE") return { status: "healthy", reason: null }
  return { status: "unknown", reason: null }
}

async function getDTMetadata(databases: string[]): Promise<Map<string, DTMeta>> {
  const map = new Map<string, DTMeta>()

  // INFORMATION_SCHEMA.DYNAMIC_TABLES() returns all DTs visible to the role regardless of db prefix
  // So we only need to call it once, and run SHOW per database for row/byte counts
  const [infoRows, ...showResults] = await Promise.all([
    querySnowflake(`
      SELECT NAME, SCHEMA_NAME, DATABASE_NAME, QUALIFIED_NAME,
             TARGET_LAG_SEC, TIME_WITHIN_TARGET_LAG_RATIO,
             SCHEDULING_STATE, LAST_COMPLETED_REFRESH_STATE,
             LATEST_DATA_TIMESTAMP
      FROM TABLE(${databases[0]}.INFORMATION_SCHEMA.DYNAMIC_TABLES())
    `).catch(() => []) as Promise<Record<string, any>[]>,
    ...databases.map((db) =>
      querySnowflake(`SHOW DYNAMIC TABLES IN DATABASE ${db}`)
        .catch(() => []) as Promise<Record<string, any>[]>
    ),
  ])

  const showMap = new Map<string, Record<string, any>>()
  for (const showRows of showResults) {
    for (const r of showRows as Record<string, any>[]) {
      showMap.set(`${r.database_name}.${r.schema_name}.${r.name}`, r)
    }
  }

  for (const r of infoRows as Record<string, any>[]) {
    const fqn = r.QUALIFIED_NAME ?? `${r.DATABASE_NAME}.${r.SCHEMA_NAME}.${r.NAME}`
    const show = showMap.get(fqn)
    map.set(fqn, {
      fqn,
      rows: show ? Number(show.rows ?? 0) : null,
      bytes: show ? Number(show.bytes ?? 0) : null,
      targetLag: show?.target_lag ?? null,
      targetLagSec: r.TARGET_LAG_SEC ? Number(r.TARGET_LAG_SEC) : null,
      lagRatio: r.TIME_WITHIN_TARGET_LAG_RATIO != null ? Number(r.TIME_WITHIN_TARGET_LAG_RATIO) : null,
      schedulingState: typeof r.SCHEDULING_STATE === "object" ? JSON.stringify(r.SCHEDULING_STATE) : (r.SCHEDULING_STATE ?? "{}"),
      lastRefreshState: r.LAST_COMPLETED_REFRESH_STATE ?? null,
      refreshMode: show?.refresh_mode ?? null,
      dataTimestamp: r.LATEST_DATA_TIMESTAMP ?? null,
    })
  }

  return map
}

export async function getTaggedObjects(databases: string[]): Promise<PipelineObject[]> {
  const all: PipelineObject[] = []
  const dtMeta = await getDTMetadata(databases)

  for (const db of databases) {
    const [tables, columns, streams, stages, semViews] = await Promise.all([
      querySnowflake(`
        SELECT TABLE_SCHEMA AS SCHEMA, TABLE_NAME AS NAME, TABLE_TYPE,
               ROW_COUNT, BYTES, CREATED, LAST_ALTERED, 
               CLUSTERING_KEY, AUTO_CLUSTERING_ON, TABLE_OWNER, COMMENT
        FROM ${db}.INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA NOT IN ('INFORMATION_SCHEMA')
        ORDER BY TABLE_SCHEMA, TABLE_NAME
      `).catch(() => []) as Promise<Record<string, any>[]>,

      querySnowflake(`
        SELECT TABLE_SCHEMA, TABLE_NAME, COUNT(*) AS COL_COUNT
        FROM ${db}.INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA NOT IN ('INFORMATION_SCHEMA')
        GROUP BY TABLE_SCHEMA, TABLE_NAME
      `).catch(() => []) as Promise<Record<string, any>[]>,

      querySnowflake(`SHOW STREAMS IN DATABASE ${db}`)
        .catch(() => []) as Promise<Record<string, any>[]>,

      querySnowflake(`SHOW STAGES IN DATABASE ${db}`)
        .catch(() => []) as Promise<Record<string, any>[]>,

      querySnowflake(`SHOW SEMANTIC VIEWS IN DATABASE ${db}`)
        .catch(() => []) as Promise<Record<string, any>[]>,
    ])

    // Build column count lookup
    const colCounts = new Map<string, number>()
    for (const c of columns) {
      colCounts.set(`${c.TABLE_SCHEMA}.${c.TABLE_NAME}`, Number(c.COL_COUNT ?? 0))
    }

    for (const r of tables) {
      const schema = r.SCHEMA ?? r.schema
      const name = r.NAME ?? r.name
      if (EXCLUDED_SCHEMAS.has(schema.toUpperCase())) continue
      const fqn = `${db}.${schema}.${name}`
      const isDT = dtMeta.has(fqn)
      const meta = dtMeta.get(fqn)
      const tableType = String(r.TABLE_TYPE ?? "")
      const objType: ObjectType = isDT ? "DYNAMIC_TABLE" : tableType === "VIEW" ? "VIEW" : "TABLE"

      let status: HealthStatus = "unknown"
      let statusReason: string | null = null
      if (isDT && meta) {
        const derived = deriveDTStatus(meta)
        status = derived.status
        statusReason = derived.reason
      } else if (objType === "TABLE") {
        status = "healthy"
      } else if (objType === "VIEW") {
        status = "healthy"
      }

      all.push({
        database: db, schema, name, fqn, objectType: objType,
        layer: schema, pipeline: db, status,
        lastRefresh: meta?.dataTimestamp ?? toIsoStr(r.LAST_ALTERED) ?? null,
        rowCount: meta?.rows ?? (r.ROW_COUNT != null ? Number(r.ROW_COUNT) : null),
        errorMessage: statusReason ?? null,
        targetLag: meta?.targetLag ?? null,
        lagRatio: meta?.lagRatio ?? null,
        bytes: meta?.bytes ?? (r.BYTES != null ? Number(r.BYTES) : null),
        refreshMode: meta?.refreshMode ?? null,
        columnCount: colCounts.get(`${schema}.${name}`) ?? null,
        createdAt: toIsoStr(r.CREATED) ?? null,
        lastAlteredAt: toIsoStr(r.LAST_ALTERED) ?? null,
        clusteringKey: r.CLUSTERING_KEY ?? null,
        autoClusteringOn: r.AUTO_CLUSTERING_ON === "YES",
        owner: r.TABLE_OWNER ?? null,
        comment: r.COMMENT ?? null,
      })
    }

    for (const r of streams) {
      if (EXCLUDED_SCHEMAS.has((r.schema_name ?? "").toUpperCase())) continue
      const stale = String(r.stale ?? "false").toLowerCase() === "true"
      all.push({
        database: db, schema: r.schema_name, name: r.name,
        fqn: `${db}.${r.schema_name}.${r.name}`,
        objectType: "STREAM", layer: r.schema_name, pipeline: db,
        status: stale ? "warning" : "healthy",
        lastRefresh: null, rowCount: null, errorMessage: stale ? "Stream is stale" : null,
      })
    }

    for (const r of stages) {
      const schema = r.schema_name
      if (!schema || EXCLUDED_SCHEMAS.has(schema.toUpperCase())) continue
      all.push({
        database: db, schema, name: r.name,
        fqn: `${db}.${schema}.${r.name}`,
        objectType: "STAGE", layer: schema, pipeline: db,
        status: "healthy", lastRefresh: null, rowCount: null, errorMessage: null,
      })
    }

    for (const r of semViews) {
      all.push({
        database: db, schema: r.schema_name, name: r.name,
        fqn: `${db}.${r.schema_name}.${r.name}`,
        objectType: "SEMANTIC_VIEW", layer: "SERVING", pipeline: db,
        status: "healthy", lastRefresh: null, rowCount: null, errorMessage: null,
      })
    }
  }

  // Add app services that consume from these databases
  try {
    const apps = await querySnowflake(`SHOW APPLICATION SERVICES IN ACCOUNT`) as Record<string, any>[]
    for (const app of apps) {
      if (app.status === "RUNNING") {
        all.push({
          database: app.database_name, schema: app.schema_name, name: app.name,
          fqn: `${app.database_name}.${app.schema_name}.${app.name}`,
          objectType: "APP_SERVICE" as ObjectType, layer: "SERVING", pipeline: app.database_name,
          status: "healthy", lastRefresh: null, rowCount: null,
          errorMessage: null, url: app.url,
        })
      }
    }
  } catch { /* no access to app services */ }

  // Add Cortex Agents via the agents list
  try {
    const agentDbs = new Set(databases)
    const agentRows = await querySnowflake(`SHOW SEMANTIC VIEWS IN ACCOUNT`) as Record<string, any>[]
    for (const r of agentRows) {
      if (agentDbs.has(r.database_name) && (r.extension ?? "").includes("CA")) {
        // Already added as semantic view, skip
      }
    }
  } catch { /* ignore */ }

  return all
}

export async function getDTEdges(databases: string[]): Promise<PipelineEdge[]> {
  const edges: PipelineEdge[] = []
  for (const db of databases) {
    const rows = await querySnowflake(`
      SELECT NAME, DATABASE_NAME, SCHEMA_NAME, QUALIFIED_NAME, INPUTS
      FROM TABLE(${db}.INFORMATION_SCHEMA.DYNAMIC_TABLE_GRAPH_HISTORY())
      WHERE VALID_TO IS NULL
    `).catch(() => []) as Record<string, any>[]

    for (const row of rows) {
      const target = row.QUALIFIED_NAME ?? `${row.DATABASE_NAME}.${row.SCHEMA_NAME}.${row.NAME}`
      if (!row.INPUTS) continue
      try {
        const inputs: Array<{ kind: string; name: string }> = JSON.parse(String(row.INPUTS))
        for (const inp of inputs) {
          edges.push({ source: inp.name, target, edgeType: "auto" })
        }
      } catch { /* skip */ }
    }
  }
  return edges
}

export async function getTaskEdges(databases: string[]): Promise<PipelineEdge[]> {
  const edges: PipelineEdge[] = []
  for (const db of databases) {
    const rows = await querySnowflake(`SHOW TASKS IN DATABASE ${db}`)
      .catch(() => []) as Record<string, any>[]
    for (const row of rows) {
      if (!row.predecessors) continue
      const target = `${row.database_name}.${row.schema_name}.${row.name}`
      try {
        const preds: string[] = JSON.parse(row.predecessors)
        for (const pred of preds) {
          if (pred) edges.push({ source: pred, target, edgeType: "auto" })
        }
      } catch {
        const pred = String(row.predecessors).trim()
        if (pred && pred !== "[]") edges.push({ source: pred, target, edgeType: "auto" })
      }
    }
  }
  return edges
}

export async function getStreamEdges(databases: string[]): Promise<PipelineEdge[]> {
  const edges: PipelineEdge[] = []
  for (const db of databases) {
    const rows = await querySnowflake(`SHOW STREAMS IN DATABASE ${db}`)
      .catch(() => []) as Record<string, any>[]
    for (const r of rows) {
      if (!r.table_name) continue
      edges.push({
        source: r.table_name,
        target: `${r.database_name}.${r.schema_name}.${r.name}`,
        edgeType: "auto",
      })
    }
  }
  return edges
}

export async function getManualEdges(database: string, schema: string): Promise<PipelineEdge[]> {
  try {
    const rows = await querySnowflake(`
      SELECT SOURCE_FQN, TARGET_FQN FROM ${database}.${schema}.O11Y_MANUAL_EDGES ORDER BY SOURCE_FQN
    `)
    return (rows as Array<{ SOURCE_FQN: string; TARGET_FQN: string }>).map((r) => ({
      source: r.SOURCE_FQN, target: r.TARGET_FQN, edgeType: "manual" as const,
    }))
  } catch { return [] }
}

export async function getFullTopology(
  databases: string[],
  tagDatabase: string,
  tagSchema: string,
): Promise<{ nodes: PipelineObject[]; edges: PipelineEdge[] }> {
  const [nodes, dtEdges, taskEdges, streamEdges, manualEdges] = await Promise.all([
    getTaggedObjects(databases),
    getDTEdges(databases),
    getTaskEdges(databases),
    getStreamEdges(databases),
    getManualEdges(tagDatabase, tagSchema),
  ])
  const edges = [...dtEdges, ...taskEdges, ...streamEdges, ...manualEdges]
  return { nodes, edges }
}
