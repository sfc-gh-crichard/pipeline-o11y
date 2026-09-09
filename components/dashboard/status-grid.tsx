"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import {
  Database,
  Table2,
  Eye,
  FolderOpen,
  Activity,
  Clock,
  Workflow,
  BarChart3,
  Bot,
  AppWindow,
  ArrowDownToLine,
  Plug,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { PipelineTopology, PipelineObject, HealthStatus, ObjectType } from "@/lib/types"

async function fetchTopology(): Promise<PipelineTopology> {
  const res = await fetch("/api/topology")
  if (!res.ok) throw new Error("Failed to fetch topology")
  return res.json()
}

const STATUS_DOT_CLASSES: Record<HealthStatus, string> = {
  healthy: "bg-[var(--status-healthy)]",
  warning: "bg-[var(--status-warning)]",
  error: "bg-[var(--status-error)]",
  inactive: "bg-[var(--status-inactive)]",
  unknown: "bg-[var(--status-inactive)]",
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  DYNAMIC_TABLE: Database,
  TABLE: Table2,
  VIEW: Eye,
  STAGE: FolderOpen,
  STREAM: Activity,
  TASK: Clock,
  PROCEDURE: Workflow,
  SEMANTIC_VIEW: BarChart3,
  AGENT: Bot,
  APP_SERVICE: AppWindow,
  STREAMLIT: AppWindow,
  PIPE: ArrowDownToLine,
  OPENFLOW_CONNECTOR: Plug,
}

const TYPE_LABELS: Record<string, string> = {
  DYNAMIC_TABLE: "Dynamic Tables",
  TABLE: "Tables",
  VIEW: "Views",
  STAGE: "Stages",
  STREAM: "Streams",
  TASK: "Tasks",
  PROCEDURE: "Procedures",
  SEMANTIC_VIEW: "Semantic Views",
  AGENT: "Agents",
  APP_SERVICE: "App Services",
  STREAMLIT: "Streamlit Apps",
  PIPE: "Pipes",
  OPENFLOW_CONNECTOR: "Openflow Connectors",
}

const TYPE_ORDER: ObjectType[] = [
  "DYNAMIC_TABLE", "TABLE", "VIEW", "STAGE", "STREAM",
  "SEMANTIC_VIEW", "APP_SERVICE", "STREAMLIT", "TASK",
  "PROCEDURE", "AGENT", "PIPE", "OPENFLOW_CONNECTOR",
]

function StatusDot({ status }: { status: HealthStatus }) {
  return (
    <span className={`inline-block h-2.5 w-2.5 rounded-full shrink-0 ${STATUS_DOT_CLASSES[status]}`} />
  )
}

function groupByPipelineAndType(nodes: PipelineObject[]) {
  const result: Record<string, Record<string, PipelineObject[]>> = {}
  for (const n of nodes) {
    const pipeline = n.pipeline || n.database
    if (!result[pipeline]) result[pipeline] = {}
    const type = n.objectType
    if (!result[pipeline][type]) result[pipeline][type] = []
    result[pipeline][type].push(n)
  }
  return result
}

export function StatusGrid() {
  const { data, isLoading, error } = useQuery<PipelineTopology>({
    queryKey: ["topology"],
    queryFn: fetchTopology,
    refetchInterval: 30_000,
  })

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-lg">Pipeline Status</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <Skeleton key={j} className="h-9 w-28 rounded-md" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground">Unable to load pipeline status.</p>
        </CardContent>
      </Card>
    )
  }

  const grouped = groupByPipelineAndType(data.nodes)

  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">Pipeline Status</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        <TooltipProvider delayDuration={200}>
          {Object.entries(grouped).map(([pipeline, typeGroups]) => {
            const allNodes = Object.values(typeGroups).flat()
            const errorCount = allNodes.filter((n) => n.status === "error").length
            const warnCount = allNodes.filter((n) => n.status === "warning").length
            return (
              <div key={pipeline}>
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-semibold">{pipeline}</h3>
                  <Badge variant="secondary" className="text-[10px]">
                    {allNodes.length} objects
                  </Badge>
                  {errorCount > 0 && (
                    <Badge variant="destructive" className="text-[10px]">
                      {errorCount} error{errorCount > 1 ? "s" : ""}
                    </Badge>
                  )}
                  {warnCount > 0 && (
                    <Badge className="text-[10px] bg-[#eab308]/10 text-[#eab308] border border-[#eab308]/30">
                      {warnCount} warning{warnCount > 1 ? "s" : ""}
                    </Badge>
                  )}
                </div>

                <div className="space-y-3 ml-1">
                  {TYPE_ORDER
                    .filter((t) => typeGroups[t] && typeGroups[t].length > 0)
                    .map((type) => {
                      const nodes = typeGroups[type]
                      const Icon = TYPE_ICONS[type] ?? Database
                      const label = TYPE_LABELS[type] ?? type
                      const typeErrors = nodes.filter((n) => n.status === "error").length
                      const typeHealthy = nodes.filter((n) => n.status === "healthy").length
                      return (
                        <div key={type}>
                          <div className="flex items-center gap-2 mb-1.5">
                            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs font-medium text-muted-foreground">
                              {label}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              ({typeHealthy}/{nodes.length} healthy)
                            </span>
                            {typeErrors > 0 && (
                              <span className="text-[10px] text-[var(--status-error)] font-medium">
                                {typeErrors} failed
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1.5 ml-5">
                            {nodes.map((node) => (
                              <Tooltip key={node.fqn}>
                                <TooltipTrigger asChild>
                                  <Link
                                    href={`/pipeline?highlight=${encodeURIComponent(node.fqn)}`}
                                    className="flex items-center gap-1.5 px-2 py-1 rounded border bg-card hover:bg-accent transition-colors text-[11px]"
                                  >
                                    <StatusDot status={node.status} />
                                    <span className="truncate max-w-[110px]">{node.name}</span>
                                  </Link>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <p className="font-medium">{node.fqn}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {node.objectType.replace(/_/g, " ")} · {node.layer || "—"} · {node.status}
                                  </p>
                                  {node.rowCount != null && node.rowCount > 0 && (
                                    <p className="text-xs text-muted-foreground">
                                      {node.rowCount.toLocaleString()} rows
                                    </p>
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                </div>
              </div>
            )
          })}
        </TooltipProvider>
      </CardContent>
    </Card>
  )
}
