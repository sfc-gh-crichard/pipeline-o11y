"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import {
  TrendingDown,
  TrendingUp,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Eye,
  EyeOff,
  BellOff,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useSilenced } from "@/components/silenced-provider"
import type { Anomaly } from "@/lib/queries/anomalies"

async function fetchAnomalies(): Promise<Anomaly[]> {
  const res = await fetch("/api/anomalies")
  if (!res.ok) return []
  return res.json()
}

const ANOMALY_ICONS: Record<string, React.ElementType> = {
  slow_refresh: Clock,
  row_count_drop: TrendingDown,
  row_count_spike: TrendingUp,
  lag_degradation: AlertTriangle,
  new_failures: AlertTriangle,
}

const SEVERITY_STYLES: Record<string, { badge: string; bg: string; border: string }> = {
  critical: {
    badge: "bg-[#ef4444]/10 text-[#ef4444] border-[#ef4444]/30",
    bg: "bg-[rgba(239,68,68,0.06)]",
    border: "border-l-[#ef4444]",
  },
  warning: {
    badge: "bg-[#eab308]/10 text-[#eab308] border-[#eab308]/30",
    bg: "bg-[rgba(234,179,8,0.06)]",
    border: "border-l-[#eab308]",
  },
  info: {
    badge: "bg-[#29b5e8]/10 text-[#29b5e8] border-[#29b5e8]/30",
    bg: "bg-[rgba(41,181,232,0.06)]",
    border: "border-l-[#29b5e8]",
  },
}

const ANOMALY_TYPE_LABELS: Record<string, string> = {
  slow_refresh: "Slow Refresh",
  row_count_drop: "Row Count Drop",
  row_count_spike: "Row Count Spike",
  lag_degradation: "Lag Degradation",
  new_failures: "New Failures",
}

interface AnomalyPanelProps {
  compact?: boolean
}

export function AnomalyPanel({ compact }: AnomalyPanelProps) {
  const [visible, setVisible] = useState(true)
  const [expanded, setExpanded] = useState(!compact)
  const { isSilenced, silence } = useSilenced()

  const { data: anomalies, isLoading } = useQuery<Anomaly[]>({
    queryKey: ["anomalies"],
    queryFn: fetchAnomalies,
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  const allItems = anomalies ?? []
  const items = allItems.filter((a) => !isSilenced(a.objectFqn))
  const silencedCount = allItems.length - items.length
  const criticalCount = items.filter((a) => a.severity === "critical").length
  const warningCount = items.filter((a) => a.severity === "warning").length

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">Anomalies</CardTitle>
            {items.length > 0 ? (
              <>
                {criticalCount > 0 && (
                  <Badge className="text-[10px] bg-[#ef4444]/10 text-[#ef4444] border border-[#ef4444]/30">
                    {criticalCount} critical
                  </Badge>
                )}
                {warningCount > 0 && (
                  <Badge className="text-[10px] bg-[#eab308]/10 text-[#eab308] border border-[#eab308]/30">
                    {warningCount} warning
                  </Badge>
                )}
                <Badge variant="secondary" className="text-[10px]">
                  {items.length} detected
                </Badge>
              </>
            ) : (
              <Badge variant="secondary" className="text-[10px]">None</Badge>
            )}
            {silencedCount > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                {silencedCount} silenced
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {items.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setVisible(!visible)}
              >
                {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </Button>
            )}
            {items.length > 3 && visible && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!visible ? (
          <p className="text-xs text-muted-foreground py-2">
            {items.length} anomal{items.length === 1 ? "y" : "ies"} hidden — click the eye icon to show
          </p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No anomalies detected — everything looks normal.
          </p>
        ) : (
          <div className="space-y-2">
            {(expanded ? items : items.slice(0, 3)).map((anomaly, i) => {
              const Icon = ANOMALY_ICONS[anomaly.anomalyType] ?? AlertTriangle
              const style = SEVERITY_STYLES[anomaly.severity] ?? SEVERITY_STYLES.info
              return (
                <div
                  key={`${anomaly.objectFqn}-${anomaly.anomalyType}-${i}`}
                  className={`rounded-md border border-l-4 ${style.border} ${style.bg} p-3`}
                >
                  <div className="flex items-start gap-2.5">
                    <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold">{anomaly.objectName}</span>
                        <Badge className={`text-[9px] px-1.5 py-0 border ${style.badge}`}>
                          {anomaly.severity}
                        </Badge>
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                          {ANOMALY_TYPE_LABELS[anomaly.anomalyType] ?? anomaly.anomalyType}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{anomaly.message}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => silence(anomaly.objectFqn)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        title="Mark as intentional — silence this object"
                      >
                        <BellOff className="h-3.5 w-3.5" />
                      </button>
                      <Link
                        href={`/pipeline?highlight=${encodeURIComponent(anomaly.objectFqn)}`}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                </div>
              )
            })}
            {!expanded && items.length > 3 && (
              <button
                onClick={() => setExpanded(true)}
                className="w-full text-xs text-primary hover:underline py-1"
              >
                Show {items.length - 3} more anomal{items.length - 3 === 1 ? "y" : "ies"}
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
