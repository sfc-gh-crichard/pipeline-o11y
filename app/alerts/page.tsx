"use client"

import { useQuery } from "@tanstack/react-query"
import { AlertTimeline } from "@/components/alerts/alert-timeline"
import { MonitoredSummary } from "@/components/alerts/monitored-summary"
import { AnomalyPanel } from "@/components/dashboard/anomaly-panel"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { AlertEvent } from "@/lib/types"
import type { MonitoredObjectCounts } from "@/lib/queries/alert-templates"
import { useState } from "react"

export default function AlertsPage() {
  const [severityFilter, setSeverityFilter] = useState<string>("all")
  const [stateFilter, setStateFilter] = useState<string>("all")

  const historyQuery = useQuery<{ history: AlertEvent[] }>({
    queryKey: ["alert-history"],
    queryFn: () => fetch("/api/alerts?action=history&limit=100").then((r) => r.json()),
    refetchInterval: 30_000,
  })

  const countsQuery = useQuery<{ counts: MonitoredObjectCounts }>({
    queryKey: ["alert-counts"],
    queryFn: () => fetch("/api/alerts?action=counts").then((r) => r.json()),
    refetchInterval: 60_000,
  })

  const events = historyQuery.data?.history ?? []
  const filtered = events.filter((e) => {
    if (severityFilter !== "all" && e.severity !== severityFilter) return false
    if (stateFilter !== "all" && e.state !== stateFilter) return false
    return true
  })

  return (
    <main className="w-full py-6 px-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Alert History</h1>
        {events.length > 0 && (
          <Badge variant="outline" className="text-xs">
            {events.length} events
          </Badge>
        )}
      </div>

      <MonitoredSummary
        counts={countsQuery.data?.counts ?? null}
        loading={countsQuery.isLoading}
      />

      <AnomalyPanel compact />

      <div className="flex items-center gap-3">
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severities</SelectItem>
            <SelectItem value="emergency">Emergency</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="info">Info</SelectItem>
          </SelectContent>
        </Select>

        <Select value={stateFilter} onValueChange={setStateFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="State" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All States</SelectItem>
            <SelectItem value="TRIGGERED">Triggered</SelectItem>
            <SelectItem value="CONDITION_FALSE">Condition False</SelectItem>
            <SelectItem value="CONDITION_FAILED">Condition Failed</SelectItem>
            <SelectItem value="ACTION_FAILED">Action Failed</SelectItem>
          </SelectContent>
        </Select>

        {(severityFilter !== "all" || stateFilter !== "all") && (
          <button
            className="text-xs text-muted-foreground hover:text-foreground underline"
            onClick={() => {
              setSeverityFilter("all")
              setStateFilter("all")
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      <AlertTimeline events={filtered} loading={historyQuery.isLoading} />
    </main>
  )
}
