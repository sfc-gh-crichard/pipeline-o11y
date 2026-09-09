"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ReactFlow,
  Background,
  MiniMap,
  type Node,
  type Edge,
  type NodeTypes,
  useNodesState,
  useEdgesState,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { useQuery } from "@tanstack/react-query"
import { Skeleton } from "@/components/ui/skeleton"
import type { PipelineTopology, PipelineObject, HealthStatus } from "@/lib/types"
import { LayerGroupNode } from "./layer-group-node"
import { CustomNode, type PipelineNodeData } from "./custom-node"
import { FlowControls } from "./flow-controls"
import { NodeDetailPanel } from "./node-detail-panel"

const nodeTypes: NodeTypes = {
  pipeline: CustomNode,
  layerGroup: LayerGroupNode,
}

const LAYER_ORDER = ["INGEST", "STAGE", "STREAM", "BRONZE", "RAW", "SILVER", "GOLD", "PLATINUM", "SERVING"]
const DATA_FLOW_SCHEMAS = new Set(["BRONZE", "RAW", "SILVER", "GOLD", "PLATINUM", "PUBLIC"])
const EXCLUDED_SCHEMAS = new Set(["OPS", "TRUTH", "APP", "INFORMATION_SCHEMA"])

function classifyLayer(obj: PipelineObject): string {
  if (obj.objectType === "STAGE") return "STAGE"
  if (obj.objectType === "STREAM") return "STREAM"
  if (obj.objectType === "SEMANTIC_VIEW" || obj.objectType === "AGENT") return "SERVING"
  if (obj.objectType === "APP_SERVICE" || obj.objectType === "STREAMLIT") return "SERVING"
  if (obj.objectType === "OPENFLOW_CONNECTOR" || obj.objectType === "PIPE") return "INGEST"
  const s = obj.schema.toUpperCase()
  if (s === "BRONZE") return "BRONZE"
  if (s === "RAW") return "RAW"
  if (s === "SILVER") return "SILVER"
  if (s === "GOLD") return "GOLD"
  if (s === "PLATINUM") return "PLATINUM"
  return s
}

function worstStatus(statuses: HealthStatus[]): HealthStatus {
  if (statuses.includes("error")) return "error"
  if (statuses.includes("warning")) return "warning"
  if (statuses.includes("inactive")) return "inactive"
  if (statuses.includes("healthy")) return "healthy"
  return "unknown"
}

function filterDataFlowObjects(nodes: PipelineObject[]): PipelineObject[] {
  return nodes.filter((n) => {
    if (n.objectType === "STAGE" || n.objectType === "STREAM") return true
    if (n.objectType === "SEMANTIC_VIEW" || n.objectType === "AGENT") return true
    if (n.objectType === "APP_SERVICE" || n.objectType === "STREAMLIT") return true
    if (n.objectType === "PIPE" || n.objectType === "OPENFLOW_CONNECTOR") return true
    if (n.objectType === "TASK") return false
    if (n.objectType === "PROCEDURE") return false
    if (EXCLUDED_SCHEMAS.has(n.schema.toUpperCase())) return false
    return true
  })
}

interface LayerGroup {
  layer: string
  objects: PipelineObject[]
  status: HealthStatus
  count: number
}

function groupByLayer(objects: PipelineObject[]): LayerGroup[] {
  const map: Record<string, PipelineObject[]> = {}
  for (const obj of objects) {
    const layer = classifyLayer(obj)
    if (!map[layer]) map[layer] = []
    map[layer].push(obj)
  }
  return LAYER_ORDER
    .filter((l) => map[l] && map[l].length > 0)
    .map((l) => ({
      layer: l,
      objects: map[l],
      status: worstStatus(map[l].map((o) => o.status)),
      count: map[l].length,
    }))
}

const GROUP_WIDTH = 180
const GROUP_HEIGHT = 70
const EXPANDED_NODE_W = 220
const EXPANDED_NODE_H = 72
const H_GAP = 220
const V_GAP = 28

function buildCompactLayout(
  groups: LayerGroup[],
  expandedLayers: Set<string>,
  topology: PipelineTopology,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []
  let xOffset = 0

  const layerCenterX: Record<string, number> = {}
  const objectPositions: Record<string, { x: number; y: number }> = {}

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i]
    const isExpanded = expandedLayers.has(g.layer)

    if (!isExpanded) {
      const y = 0
      nodes.push({
        id: `layer-${g.layer}`,
        type: "layerGroup",
        position: { x: xOffset, y },
        draggable: false,
        data: {
          label: g.layer,
          count: g.count,
          status: g.status,
          expanded: false,
          objectTypes: [...new Set(g.objects.map((o) => o.objectType))],
        },
      })
      layerCenterX[g.layer] = xOffset + GROUP_WIDTH / 2
      xOffset += GROUP_WIDTH + H_GAP
    } else {
      // Add a pinned section header above the expanded nodes
      const totalHeight = g.objects.length * (EXPANDED_NODE_H + V_GAP) - V_GAP
      const headerY = -totalHeight / 2 - 64
      nodes.push({
        id: `layer-header-${g.layer}`,
        type: "layerGroup",
        position: { x: xOffset - 10, y: headerY },
        draggable: false,
        selectable: true,
        data: {
          label: g.layer,
          count: g.count,
          status: g.status,
          expanded: true,
          objectTypes: [...new Set(g.objects.map((o) => o.objectType))],
        },
      })

      const startY = -totalHeight / 2

      for (let j = 0; j < g.objects.length; j++) {
        const obj = g.objects[j]
        const y = startY + j * (EXPANDED_NODE_H + V_GAP)
        nodes.push({
          id: obj.fqn,
          type: "pipeline",
          position: { x: xOffset, y },
          data: {
            label: obj.name,
            objectType: obj.objectType,
            status: obj.status,
            layer: g.layer,
            pipeline: obj.pipeline,
            errorMessage: obj.errorMessage,
            lagRatio: obj.lagRatio,
            rowCount: obj.rowCount,
            bytes: obj.bytes,
            refreshMode: obj.refreshMode,
            targetLag: obj.targetLag,
          } satisfies PipelineNodeData,
        })
        objectPositions[obj.fqn] = { x: xOffset, y }
      }
      layerCenterX[g.layer] = xOffset + EXPANDED_NODE_W / 2
      xOffset += EXPANDED_NODE_W + H_GAP
    }
  }

  // Build edges between layers (compact) or between nodes (expanded)
  const edgeColor = (status: HealthStatus) => {
    if (status === "error") return "#ef4444"
    if (status === "warning") return "#eab308"
    if (status === "healthy") return "#22c55e"
    return "var(--border)"
  }

  for (let i = 0; i < groups.length - 1; i++) {
    const src = groups[i]
    const tgt = groups[i + 1]
    const srcExpanded = expandedLayers.has(src.layer)
    const tgtExpanded = expandedLayers.has(tgt.layer)
    const pairStatus = worstStatus([src.status, tgt.status])
    const color = edgeColor(pairStatus === "unknown" ? "healthy" : pairStatus)

    if (!srcExpanded && !tgtExpanded) {
      edges.push({
        id: `layer-edge-${src.layer}-${tgt.layer}`,
        source: `layer-${src.layer}`,
        target: `layer-${tgt.layer}`,
        animated: pairStatus === "healthy",
        style: { stroke: color, strokeWidth: 2.5 },
        type: "default",
      })
    } else if (srcExpanded && !tgtExpanded) {
      for (const obj of src.objects) {
        const c = edgeColor(obj.status === "unknown" ? "healthy" : obj.status)
        edges.push({
          id: `edge-${obj.fqn}-layer-${tgt.layer}`,
          source: obj.fqn,
          target: `layer-${tgt.layer}`,
          animated: obj.status === "healthy",
          style: { stroke: c, strokeWidth: 1.5 },
          type: "default",
        })
      }
    } else if (!srcExpanded && tgtExpanded) {
      for (const obj of tgt.objects) {
        const c = edgeColor(obj.status === "unknown" ? "healthy" : obj.status)
        edges.push({
          id: `edge-layer-${src.layer}-${obj.fqn}`,
          source: `layer-${src.layer}`,
          target: obj.fqn,
          animated: obj.status === "healthy",
          style: { stroke: c, strokeWidth: 1.5 },
          type: "default",
        })
      }
    } else {
      const srcFqns = new Set(src.objects.map((o) => o.fqn))
      const tgtFqns = new Set(tgt.objects.map((o) => o.fqn))
      const realEdges = topology.edges.filter(
        (e) => srcFqns.has(e.source) && tgtFqns.has(e.target),
      )
      if (realEdges.length > 0) {
        for (const e of realEdges) {
          const srcObj = src.objects.find((o) => o.fqn === e.source)
          const tgtObj = tgt.objects.find((o) => o.fqn === e.target)
          const s = worstStatus([srcObj?.status ?? "unknown", tgtObj?.status ?? "unknown"])
          const c = edgeColor(s === "unknown" ? "healthy" : s)
          edges.push({
            id: `real-${e.source}-${e.target}`,
            source: e.source,
            target: e.target,
            animated: s !== "error",
            style: { stroke: c, strokeWidth: 1.5 },
        type: "default",
          })
        }
      } else {
        for (const s of src.objects) {
          for (const t of tgt.objects) {
            edges.push({
              id: `fan-${s.fqn}-${t.fqn}`,
              source: s.fqn,
              target: t.fqn,
              animated: true,
              style: { stroke: color, strokeWidth: 1 },
        type: "default",
            })
          }
        }
      }
    }
  }

  return { nodes, edges }
}

interface PipelineFlowProps {
  highlightFqn?: string | null
}

export function PipelineFlow({ highlightFqn }: PipelineFlowProps) {
  const [selectedNode, setSelectedNode] = useState<PipelineObject | null>(null)
  const [expandedLayers, setExpandedLayers] = useState<Set<string>>(new Set())
  const [pipelineFilter, setPipelineFilter] = useState<string | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [pinnedNodeId, setPinnedNodeId] = useState<string | null>(null)
  const highlightApplied = useRef(false)

  // The active focus node: pinned takes priority, then hovered
  const focusNodeId = pinnedNodeId ?? hoveredNodeId

  const { data: topology, isLoading, error } = useQuery<PipelineTopology>({
    queryKey: ["topology"],
    queryFn: async () => {
      const res = await fetch("/api/topology")
      if (!res.ok) throw new Error("Failed to fetch topology")
      return res.json()
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  // When navigating from Home with ?highlight=FQN, auto-expand the layer and pin the node
  useEffect(() => {
    if (!highlightFqn || !topology || highlightApplied.current) return
    const obj = topology.nodes.find((n) => n.fqn === highlightFqn)
    if (!obj) return
    highlightApplied.current = true
    const layer = classifyLayer(obj)
    setExpandedLayers((prev) => new Set([...prev, layer]))
    setSelectedNode(obj)
    setPinnedNodeId(highlightFqn)
  }, [highlightFqn, topology])

  const pipelines = useMemo(() => {
    if (!topology) return []
    return [...new Set(topology.nodes.map((n) => n.pipeline))].sort()
  }, [topology])

  const { layoutNodes, layoutEdges, groups } = useMemo(() => {
    if (!topology) return { layoutNodes: [], layoutEdges: [], groups: [] }

    let filtered = filterDataFlowObjects(topology.nodes)
    if (pipelineFilter) {
      filtered = filtered.filter((n) => n.pipeline === pipelineFilter)
    }

    const groups = groupByLayer(filtered)
    const { nodes, edges } = buildCompactLayout(groups, expandedLayers, topology)
    return { layoutNodes: nodes, layoutEdges: edges, groups }
  }, [topology, expandedLayers, pipelineFilter])

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutEdges)

  // Apply hover/pin highlighting: bold connected edges, dim everything else
  useMemo(() => {
    if (!focusNodeId) {
      setNodes(layoutNodes)
      setEdges(layoutEdges)
      return
    }

    // Find all edges connected to the focus node
    const connectedEdges = new Set<string>()
    const connectedNodes = new Set<string>([focusNodeId])
    for (const edge of layoutEdges) {
      if (edge.source === focusNodeId || edge.target === focusNodeId) {
        connectedEdges.add(edge.id)
        connectedNodes.add(edge.source)
        connectedNodes.add(edge.target)
      }
    }

    setNodes(
      layoutNodes.map((n) => ({
        ...n,
        style: connectedNodes.has(n.id)
          ? { opacity: 1, transition: "opacity 0.15s" }
          : { opacity: 0.25, transition: "opacity 0.15s" },
      }))
    )
    setEdges(
      layoutEdges.map((e) => ({
        ...e,
        style: connectedEdges.has(e.id)
          ? { ...e.style, strokeWidth: 4, opacity: 1, transition: "all 0.15s" }
          : { ...e.style, strokeWidth: 1, opacity: 0.12, transition: "all 0.15s" },
        animated: connectedEdges.has(e.id) ? e.animated : false,
      }))
    )
  }, [layoutNodes, layoutEdges, focusNodeId, setNodes, setEdges])

  const toggleLayer = useCallback((layer: string) => {
    setExpandedLayers((prev) => {
      const next = new Set(prev)
      if (next.has(layer)) next.delete(layer)
      else next.add(layer)
      return next
    })
  }, [])

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.type === "layerGroup") {
        const layer = (node.data as Record<string, unknown>).label as string
        toggleLayer(layer)
        return
      }
      if (!topology) return
      const obj = topology.nodes.find((n) => n.fqn === node.id)
      setSelectedNode(obj ?? null)
      // Pin this node so the highlight sticks
      setPinnedNodeId((prev) => (prev === node.id ? null : node.id))
    },
    [topology, toggleLayer],
  )

  const onNodeMouseEnter = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type !== "layerGroup" && !pinnedNodeId) {
      setHoveredNodeId(node.id)
    }
  }, [pinnedNodeId])

  const onNodeMouseLeave = useCallback(() => {
    if (!pinnedNodeId) {
      setHoveredNodeId(null)
    }
  }, [pinnedNodeId])

  // Click on empty canvas clears the pin
  const onPaneClick = useCallback(() => {
    setPinnedNodeId(null)
    setHoveredNodeId(null)
    setSelectedNode(null)
  }, [])

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="space-y-3 w-80">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-sm text-muted-foreground">Failed to load pipeline topology</p>
          <p className="text-xs text-destructive">{(error as Error).message}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex-1">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} />
        <MiniMap pannable zoomable className="!bg-card !border-border" />
        <FlowControls
          pipelines={pipelines}
          pipelineFilter={pipelineFilter}
          onPipelineFilter={setPipelineFilter}
          expandedLayers={expandedLayers}
          groups={groups}
          onToggleLayer={toggleLayer}
        />
      </ReactFlow>
      <NodeDetailPanel node={selectedNode} onClose={() => setSelectedNode(null)} />
    </div>
  )
}
