"use client"

import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { formatDistanceToNow } from "date-fns"
import {
  X, AlertCircle, Clock, Database, Layers, Columns3,
  HardDrive, User, Hash, Snowflake, FileText, RefreshCw,
  BellOff, Bell,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { useSilenced } from "@/components/silenced-provider"
import type { PipelineObject, RefreshEvent } from "@/lib/types"

interface NodeDetailPanelProps {
  node: PipelineObject | null
  onClose: () => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60_000).toFixed(1)}m`
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—"
  try {
    const cleaned = iso.replace(/^"+|"+$/g, "")
    return formatDistanceToNow(new Date(cleaned), { addSuffix: true })
  } catch { return iso }
}

export function NodeDetailPanel({ node, onClose }: NodeDetailPanelProps) {
  const { isSilenced, silence, unsilence } = useSilenced()
  const router = useRouter()
  if (!node) return null

  const isDT = node.objectType === "DYNAMIC_TABLE"
  const isTable = node.objectType === "TABLE"
  const isView = node.objectType === "VIEW"
  const silenced = isSilenced(node.fqn)
  const hasIssue = node.status === "error" || node.status === "inactive"

  return (
    <div className="absolute top-0 right-0 z-20 h-full w-96 border-l bg-card shadow-lg overflow-y-auto">
      <div className="sticky top-0 flex items-center justify-between border-b bg-card p-3 z-10">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold truncate">{node.name}</h3>
          <p className="text-[10px] text-muted-foreground truncate">{node.fqn}</p>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-4 space-y-4">
        {/* Status + Type row */}
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={silenced ? "silenced" : node.status} />
          <Badge variant="secondary" className="text-[10px] uppercase">
            {node.objectType.replace(/_/g, " ")}
          </Badge>
          {node.refreshMode && (
            <Badge variant="secondary" className="text-[10px]">
              {node.refreshMode}
            </Badge>
          )}
          {silenced && (
            <Badge className="text-[9px] bg-primary/10 text-primary border border-primary/30">
              Intentional
            </Badge>
          )}
        </div>

        {/* Silence / unsilence button for objects with issues */}
        {hasIssue && (
          <Button
            variant={silenced ? "default" : "outline"}
            size="sm"
            className="w-full"
            onClick={() => silenced ? unsilence(node.fqn) : silence(node.fqn)}
          >
            {silenced ? (
              <>
                <Bell className="h-3.5 w-3.5 mr-1.5" />
                Re-enable monitoring
              </>
            ) : (
              <>
                <BellOff className="h-3.5 w-3.5 mr-1.5" />
                Mark as intentional pause
              </>
            )}
          </Button>
        )}

        {/* Quick create alert */}
        {(isDT || node.objectType === "TASK" || node.objectType === "STREAM") && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => router.push(`/create-alert?object=${encodeURIComponent(node.fqn)}&type=${encodeURIComponent(node.objectType)}`)}
          >
            <Bell className="h-3.5 w-3.5 mr-1.5" />
            Create alert for {node.name}
          </Button>
        )}

        {/* Error callout */}
        {node.errorMessage && (
          <div className="rounded border border-[var(--status-error)] bg-[var(--status-error-bg)] p-2">
            <div className="flex items-center gap-1.5 text-xs text-[var(--status-error)] font-medium mb-1">
              <AlertCircle className="h-3 w-3" /> Error
            </div>
            <p className="text-xs text-foreground/80 break-words">{node.errorMessage}</p>
          </div>
        )}

        {/* Comment */}
        {node.comment && (
          <div className="rounded bg-muted/50 p-2.5">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium mb-1">
              <FileText className="h-3 w-3" /> Description
            </div>
            <p className="text-xs text-foreground/80 leading-relaxed line-clamp-4">{node.comment}</p>
          </div>
        )}

        <Separator />

        {/* Key metrics grid */}
        <div className="grid grid-cols-2 gap-3">
          {node.rowCount != null && (
            <MetricCard icon={Hash} label="Rows" value={node.rowCount.toLocaleString()} />
          )}
          {node.bytes != null && node.bytes > 0 && (
            <MetricCard icon={HardDrive} label="Storage" value={formatBytes(node.bytes)} />
          )}
          {node.columnCount != null && (
            <MetricCard icon={Columns3} label="Columns" value={String(node.columnCount)} />
          )}
          <MetricCard icon={Database} label="Layer" value={node.layer} />
          {node.owner && (
            <MetricCard icon={User} label="Owner" value={node.owner} />
          )}
          {node.targetLag && (
            <MetricCard icon={Clock} label="Target Lag" value={node.targetLag} />
          )}
          {node.lagRatio != null && (
            <MetricCard
              icon={RefreshCw}
              label="In-Target %"
              value={`${(node.lagRatio * 100).toFixed(0)}%`}
              accent={node.lagRatio >= 0.9 ? "healthy" : "warning"}
            />
          )}
          {node.clusteringKey && (
            <MetricCard icon={Snowflake} label="Clustering" value={node.clusteringKey} />
          )}
        </div>

        {/* Timestamps */}
        {(node.lastRefresh || node.createdAt || node.lastAlteredAt) && (
          <>
            <Separator />
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground">Timeline</h4>
              {node.lastRefresh && (
                <TimelineRow label={isDT ? "Last Refresh" : "Last Modified"} time={node.lastRefresh} />
              )}
              {node.lastAlteredAt && node.lastAlteredAt !== node.lastRefresh && (
                <TimelineRow label="Last Altered" time={node.lastAlteredAt} />
              )}
              {node.createdAt && (
                <TimelineRow label="Created" time={node.createdAt} />
              )}
            </div>
          </>
        )}

        {/* Refresh history for DTs */}
        {isDT && (
          <>
            <Separator />
            <RefreshHistory fqn={node.fqn} objectType={node.objectType} />
          </>
        )}

        {/* Column list for tables/views */}
        {(isTable || isView || isDT) && (
          <>
            <Separator />
            <ColumnList fqn={node.fqn} database={node.database} schema={node.schema} name={node.name} />
          </>
        )}
      </div>
    </div>
  )
}

function MetricCard({
  icon: Icon, label, value, accent,
}: {
  icon: React.ElementType; label: string; value: string; accent?: "healthy" | "warning" | "error"
}) {
  const accentColor = accent === "healthy"
    ? "text-[var(--status-healthy)]"
    : accent === "warning"
      ? "text-[var(--status-warning)]"
      : accent === "error"
        ? "text-[var(--status-error)]"
        : "text-foreground"

  return (
    <div className="rounded-md border bg-background p-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground">{label}</span>
      </div>
      <span className={`text-sm font-semibold ${accentColor}`}>{value}</span>
    </div>
  )
}

function TimelineRow({ label, time }: { label: string; time: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-[11px]">{timeAgo(time)}</span>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    healthy: "bg-[var(--status-healthy-bg)] text-[var(--status-healthy)] border-[var(--status-healthy)]/30",
    warning: "bg-[var(--status-warning-bg)] text-[var(--status-warning)] border-[var(--status-warning)]/30",
    error: "bg-[var(--status-error-bg)] text-[var(--status-error)] border-[var(--status-error)]/30",
    inactive: "bg-[var(--status-error-bg)] text-[var(--status-error)] border-[var(--status-error)]/30",
    silenced: "bg-primary/10 text-primary border-primary/30",
    unknown: "bg-muted text-muted-foreground border-border",
  }
  return (
    <Badge className={`text-[10px] capitalize border ${colors[status] ?? colors.unknown}`}>
      {status}
    </Badge>
  )
}

function RefreshHistory({ fqn, objectType }: { fqn: string; objectType: string }) {
  const { data, isLoading } = useQuery<RefreshEvent[]>({
    queryKey: ["refresh-history", fqn],
    queryFn: async () => {
      const res = await fetch(`/api/health?fqn=${encodeURIComponent(fqn)}&type=${objectType}`)
      if (!res.ok) return []
      const json = await res.json()
      return json.refreshHistory ?? []
    },
    staleTime: 30_000,
  })

  return (
    <div>
      <h4 className="text-xs font-semibold mb-2">Recent Refreshes</h4>
      {isLoading ? (
        <div className="space-y-1.5">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
        </div>
      ) : !data || data.length === 0 ? (
        <p className="text-xs text-muted-foreground">No refresh history available</p>
      ) : (
        <div className="space-y-1">
          {data.slice(0, 10).map((event, i) => (
            <div
              key={i}
              className={`flex items-center justify-between rounded px-2 py-1 text-[11px] ${
                event.state === "SUCCEEDED"
                  ? "bg-[var(--status-healthy-bg)]"
                  : event.state === "FAILED"
                    ? "bg-[var(--status-error-bg)]"
                    : "bg-secondary"
              }`}
            >
              <span className="font-mono">{new Date(event.startedAt).toLocaleTimeString()}</span>
              <span className={event.state === "FAILED" ? "text-[var(--status-error)] font-medium" : ""}>
                {event.state}
              </span>
              <span className="text-muted-foreground">{formatDuration(event.durationMs)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface ColumnInfo {
  COLUMN_NAME: string
  DATA_TYPE: string
  IS_NULLABLE: string
  COMMENT: string | null
}

function ColumnList({ fqn, database, schema, name }: { fqn: string; database: string; schema: string; name: string }) {
  const { data, isLoading } = useQuery<ColumnInfo[]>({
    queryKey: ["columns", fqn],
    queryFn: async () => {
      const res = await fetch(`/api/topology?action=columns&database=${database}&schema=${schema}&name=${name}`)
      if (!res.ok) return []
      return res.json()
    },
    staleTime: 60_000,
  })

  return (
    <div>
      <h4 className="text-xs font-semibold mb-2">
        Columns {data ? `(${data.length})` : ""}
      </h4>
      {isLoading ? (
        <div className="space-y-1">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
        </div>
      ) : !data || data.length === 0 ? (
        <p className="text-xs text-muted-foreground">No column info available</p>
      ) : (
        <div className="space-y-0.5 max-h-60 overflow-y-auto">
          {data.map((col, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-2 py-1 rounded text-[11px] hover:bg-muted/50"
            >
              <span className="font-mono font-medium truncate flex-1">{col.COLUMN_NAME}</span>
              <Badge variant="secondary" className="text-[9px] font-mono px-1.5 py-0 shrink-0">
                {col.DATA_TYPE}
              </Badge>
              {col.IS_NULLABLE === "NO" && (
                <span className="text-[9px] text-muted-foreground shrink-0">NOT NULL</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
