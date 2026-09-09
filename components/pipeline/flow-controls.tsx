"use client"

import { useReactFlow } from "@xyflow/react"
import { Maximize, ZoomIn, ZoomOut, ChevronDown, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { HealthStatus } from "@/lib/types"

interface LayerGroup {
  layer: string
  count: number
  status: HealthStatus
}

interface FlowControlsProps {
  pipelines: string[]
  pipelineFilter: string | null
  onPipelineFilter: (pipeline: string | null) => void
  expandedLayers: Set<string>
  groups: LayerGroup[]
  onToggleLayer: (layer: string) => void
}

const STATUS_DOT: Record<HealthStatus, string> = {
  healthy: "bg-[var(--status-healthy)]",
  warning: "bg-[var(--status-warning)]",
  error: "bg-[var(--status-error)]",
  inactive: "bg-[var(--status-inactive)]",
  unknown: "bg-[var(--status-inactive)]",
}

export function FlowControls({
  pipelines,
  pipelineFilter,
  onPipelineFilter,
  expandedLayers,
  groups,
  onToggleLayer,
}: FlowControlsProps) {
  const { fitView, zoomIn, zoomOut } = useReactFlow()

  return (
    <div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
      <div className="flex gap-1 rounded-md border bg-card p-1 shadow-sm">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => zoomIn()}>
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => zoomOut()}>
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => fitView({ padding: 0.2 })}>
          <Maximize className="h-3.5 w-3.5" />
        </Button>
      </div>

      {pipelines.length > 1 && (
        <div className="flex flex-col gap-1 rounded-md border bg-card p-1.5 shadow-sm">
          <span className="text-[10px] text-muted-foreground">Pipeline</span>
          <button
            onClick={() => onPipelineFilter(null)}
            className={`text-[10px] px-1.5 py-0.5 rounded text-left transition-colors ${
              !pipelineFilter ? "bg-primary text-primary-foreground" : "hover:bg-accent"
            }`}
          >
            All
          </button>
          {pipelines.map((p) => (
            <button
              key={p}
              onClick={() => onPipelineFilter(pipelineFilter === p ? null : p)}
              className={`text-[10px] px-1.5 py-0.5 rounded text-left transition-colors ${
                pipelineFilter === p ? "bg-primary text-primary-foreground" : "hover:bg-accent"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-0.5 rounded-md border bg-card p-1.5 shadow-sm">
        <span className="text-[10px] text-muted-foreground mb-0.5">Layers (click to expand)</span>
        {groups.map((g) => {
          const isExpanded = expandedLayers.has(g.layer)
          return (
            <button
              key={g.layer}
              onClick={() => onToggleLayer(g.layer)}
              className="flex items-center gap-1.5 text-[10px] px-1.5 py-1 rounded hover:bg-accent transition-colors text-left"
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3 shrink-0" />
              ) : (
                <ChevronRight className="h-3 w-3 shrink-0" />
              )}
              <span className={`h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[g.status]}`} />
              <span className="flex-1">{g.layer}</span>
              <span className="text-muted-foreground">{g.count}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
