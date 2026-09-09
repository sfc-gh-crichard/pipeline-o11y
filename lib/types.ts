export type HealthStatus = "healthy" | "warning" | "error" | "inactive" | "unknown"

export type ObjectType =
  | "DYNAMIC_TABLE"
  | "TABLE"
  | "VIEW"
  | "STAGE"
  | "STREAM"
  | "TASK"
  | "PROCEDURE"
  | "SEMANTIC_VIEW"
  | "AGENT"
  | "PIPE"
  | "OPENFLOW_CONNECTOR"
  | "APP_SERVICE"
  | "STREAMLIT"

export interface PipelineObject {
  database: string
  schema: string
  name: string
  fqn: string
  objectType: ObjectType
  layer: string
  pipeline: string
  status: HealthStatus
  lastRefresh?: string | null
  rowCount?: number | null
  errorMessage?: string | null
  targetLag?: string | null
  lagRatio?: number | null
  bytes?: number | null
  refreshMode?: string | null
  url?: string | null
  columnCount?: number | null
  createdAt?: string | null
  lastAlteredAt?: string | null
  clusteringKey?: string | null
  autoClusteringOn?: boolean
  owner?: string | null
  comment?: string | null
}

export interface PipelineTopology {
  nodes: PipelineObject[]
  edges: PipelineEdge[]
}

export interface PipelineEdge {
  source: string
  target: string
  edgeType: "auto" | "manual"
}

export interface RefreshEvent {
  name: string
  database: string
  schema: string
  state: "SUCCEEDED" | "FAILED" | "UPSTREAM_FAILED" | "CANCELLED"
  stateMessage: string | null
  refreshAction: string | null
  startedAt: string
  completedAt: string
  durationMs: number
  rowsInserted: number
  rowsDeleted: number
}

export interface TaskRun {
  name: string
  database: string
  schema: string
  state: string
  errorCode: string | null
  errorMessage: string | null
  scheduledTime: string
  completedTime: string | null
  durationMs: number | null
  queryId: string | null
}

export interface AlertConfig {
  name: string
  database: string
  schema: string
  objectFqn: string
  objectType: ObjectType
  conditionType: string
  schedule: string
  warehouse: string | null
  email: string
  enabled: boolean
}

export interface AlertEvent {
  alertName: string
  scheduledTime: string
  state: string
  conditionResult: boolean
  actionResult: string | null
  severity: "emergency" | "warning" | "info"
}

export interface HealthSummary {
  totalObjects: number
  healthyCount: number
  warningCount: number
  errorCount: number
  inactiveCount: number
  byType: Record<string, { total: number; healthy: number; error: number }>
  recentFailures: RefreshEvent[]
}
