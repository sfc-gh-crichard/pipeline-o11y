"use client"

import { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import {
  ChevronRight,
  ChevronDown,
  Database,
  FolderOpen,
  Activity,
  Eye,
  Plug,
} from "lucide-react"
import type { HealthStatus, ObjectType } from "@/lib/types"

export interface LayerGroupData extends Record<string, unknown> {
  label: string
  count: number
  status: HealthStatus
  expanded: boolean
  objectTypes: ObjectType[]
}

const STATUS_DOT: Record<HealthStatus, string> = {
  healthy: "bg-[#22c55e]",
  warning: "bg-[#eab308]",
  error: "bg-[#ef4444]",
  inactive: "bg-[#ef4444]",
  unknown: "bg-[#6b7280]",
}

const STATUS_ACCENT: Record<HealthStatus, string> = {
  healthy: "border-l-[#22c55e]",
  warning: "border-l-[#eab308]",
  error: "border-l-[#ef4444]",
  inactive: "border-l-[#ef4444]",
  unknown: "border-l-[#6b7280]",
}

const LAYER_LABELS: Record<string, string> = {
  INGEST: "Ingestion",
  STAGE: "Stage",
  STREAM: "Stream",
  BRONZE: "Bronze / Raw Tables",
  RAW: "Extraction",
  SILVER: "Silver / Transforms",
  GOLD: "Gold / Serving",
  PLATINUM: "Platinum / Corrected",
  SERVING: "BI / Agents",
}

const LAYER_ICONS: Record<string, React.ElementType> = {
  INGEST: Plug,
  STAGE: FolderOpen,
  STREAM: Activity,
  BRONZE: Database,
  RAW: Database,
  SILVER: Database,
  GOLD: Eye,
  PLATINUM: Eye,
  SERVING: Eye,
}

function LayerGroupComponent({ data, selected }: NodeProps) {
  const d = data as unknown as LayerGroupData
  const Icon = LAYER_ICONS[d.label] ?? Database
  const friendlyLabel = LAYER_LABELS[d.label] ?? d.label
  const isExpanded = d.expanded

  if (isExpanded) {
    // Expanded header: looks like a section label, NOT like a data node
    return (
      <div
        className={`rounded-lg border border-border/50 border-l-4 ${STATUS_ACCENT[d.status]}
          bg-background/80 backdrop-blur-sm px-4 py-2 cursor-pointer
          hover:bg-accent/50 transition-colors select-none`}
      >
        <div className="flex items-center gap-2">
          <ChevronDown className="h-4 w-4 text-primary shrink-0" />
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            {friendlyLabel}
          </span>
          <span className={`h-2 w-2 rounded-full ${STATUS_DOT[d.status]}`} />
          <span className="text-[10px] text-muted-foreground ml-auto">
            {d.count} object{d.count !== 1 ? "s" : ""} — click to collapse
          </span>
        </div>
      </div>
    )
  }

  // Collapsed: interactive pipeline node with handles
  return (
    <div
      className={`rounded-xl border-2 border-border bg-card px-5 py-4 shadow-md cursor-pointer
        transition-all hover:shadow-lg min-w-[180px]
        ${selected ? "ring-2 ring-ring" : ""}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-muted-foreground !w-2.5 !h-2.5" />
      <div className="flex items-center gap-3">
        <div className={`p-1.5 rounded-lg bg-primary/10`}>
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">{friendlyLabel}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[d.status]}`} />
            <span className="text-[11px] text-muted-foreground">
              {d.count} object{d.count !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
        <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
      </div>
      <Handle type="source" position={Position.Right} className="!bg-muted-foreground !w-2.5 !h-2.5" />
    </div>
  )
}

export const LayerGroupNode = memo(LayerGroupComponent)
