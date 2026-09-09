"use client"

import { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import {
  Database,
  Table2,
  Eye,
  FolderOpen,
  Activity,
  Bot,
  ArrowDownToLine,
  Plug,
  AppWindow,
  BarChart3,
} from "lucide-react"
import type { HealthStatus, ObjectType } from "@/lib/types"

export interface PipelineNodeData extends Record<string, unknown> {
  label: string
  objectType: ObjectType
  status: HealthStatus
  layer: string
  pipeline: string
  errorMessage?: string | null
  lagRatio?: number | null
  rowCount?: number | null
  bytes?: number | null
  refreshMode?: string | null
  targetLag?: string | null
}

const ICON_MAP: Record<string, React.ElementType> = {
  DYNAMIC_TABLE: Database,
  TABLE: Table2,
  VIEW: Eye,
  STAGE: FolderOpen,
  STREAM: Activity,
  SEMANTIC_VIEW: BarChart3,
  AGENT: Bot,
  PIPE: ArrowDownToLine,
  OPENFLOW_CONNECTOR: Plug,
  APP_SERVICE: AppWindow,
  STREAMLIT: AppWindow,
}

const STATUS_STYLES: Record<HealthStatus, { border: string; bg: string; dot: string; glow: string }> = {
  healthy: {
    border: "border-[#22c55e]",
    bg: "bg-[rgba(34,197,94,0.08)]",
    dot: "bg-[#22c55e]",
    glow: "shadow-[0_0_8px_rgba(34,197,94,0.3)]",
  },
  warning: {
    border: "border-[#eab308]",
    bg: "bg-[rgba(234,179,8,0.08)]",
    dot: "bg-[#eab308]",
    glow: "shadow-[0_0_8px_rgba(234,179,8,0.3)]",
  },
  error: {
    border: "border-[#ef4444]",
    bg: "bg-[rgba(239,68,68,0.12)]",
    dot: "bg-[#ef4444]",
    glow: "shadow-[0_0_12px_rgba(239,68,68,0.4)]",
  },
  inactive: {
    border: "border-[#ef4444]",
    bg: "bg-[rgba(239,68,68,0.08)]",
    dot: "bg-[#ef4444]",
    glow: "shadow-[0_0_10px_rgba(239,68,68,0.35)]",
  },
  unknown: {
    border: "border-border",
    bg: "bg-card",
    dot: "bg-[#6b7280]",
    glow: "",
  },
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatRows(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`
  return `${(n / 1_000_000).toFixed(1)}M`
}

function CustomNodeComponent({ data, selected }: NodeProps) {
  const d = data as unknown as PipelineNodeData
  const Icon = ICON_MAP[d.objectType] ?? Database
  const style = STATUS_STYLES[d.status]

  return (
    <div
      className={`rounded-lg border-2 px-3 py-2 min-w-[190px] max-w-[220px] transition-all
        ${style.border} ${style.bg} ${style.glow}
        ${selected ? "ring-2 ring-ring shadow-lg scale-105" : "hover:shadow-md"}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-muted-foreground !w-2 !h-2" />
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-xs font-semibold truncate flex-1">{d.label}</span>
        <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${style.dot} ${(d.status === "error" || d.status === "inactive") ? "animate-pulse" : ""}`} />
      </div>
      <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
        <span className="uppercase">{d.objectType.replace(/_/g, " ")}</span>
        {d.rowCount != null && d.rowCount > 0 && (
          <>
            <span className="text-border">|</span>
            <span>{formatRows(d.rowCount)} rows</span>
          </>
        )}
        {d.bytes != null && d.bytes > 0 && (
          <>
            <span className="text-border">|</span>
            <span>{formatBytes(d.bytes)}</span>
          </>
        )}
      </div>
      {d.targetLag && (
        <div className="text-[10px] text-muted-foreground mt-0.5">
          lag: {d.targetLag}
          {d.lagRatio != null && (
            <span className={d.lagRatio >= 1 ? "text-[#22c55e] ml-1" : "text-[#eab308] ml-1"}>
              ({(d.lagRatio * 100).toFixed(0)}% in target)
            </span>
          )}
        </div>
      )}
      {d.errorMessage && (
        <div className="text-[10px] text-[#ef4444] font-medium mt-0.5 truncate">
          {d.errorMessage}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-muted-foreground !w-2 !h-2" />
    </div>
  )
}

export const CustomNode = memo(CustomNodeComponent)
