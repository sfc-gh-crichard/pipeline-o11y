"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { MonitoredObjectCounts } from "@/lib/queries/alert-templates"
import { Activity, Database, Radio, Bell } from "lucide-react"

interface MonitoredSummaryProps {
  counts: MonitoredObjectCounts | null
  loading?: boolean
}

export function MonitoredSummary({ counts, loading }: MonitoredSummaryProps) {
  if (loading || !counts) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="h-6 animate-pulse rounded bg-muted w-3/4" />
        </CardContent>
      </Card>
    )
  }

  const total =
    counts.dynamicTables.total +
    counts.tasks.total +
    counts.streams.total +
    counts.alerts.total

  const items = [
    {
      icon: <Database className="h-3.5 w-3.5" />,
      label: "DTs",
      total: counts.dynamicTables.total,
      detail: `${counts.dynamicTables.healthy} running, ${counts.dynamicTables.error} failing`,
      hasError: counts.dynamicTables.error > 0,
    },
    {
      icon: <Activity className="h-3.5 w-3.5" />,
      label: "Tasks",
      total: counts.tasks.total,
      detail: `${counts.tasks.healthy} running, ${counts.tasks.error} suspended`,
      hasError: counts.tasks.error > 0,
    },
    {
      icon: <Radio className="h-3.5 w-3.5" />,
      label: "Streams",
      total: counts.streams.total,
      detail: `${counts.streams.healthy} active, ${counts.streams.stale} stale`,
      hasError: counts.streams.stale > 0,
    },
    {
      icon: <Bell className="h-3.5 w-3.5" />,
      label: "Alerts",
      total: counts.alerts.total,
      detail: `${counts.alerts.active} active`,
      hasError: false,
    },
  ]

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-sm font-medium">
            Monitoring {total} objects:
          </span>
          {items.map((item) => (
            <div key={item.label} className="flex items-center gap-1.5 text-xs">
              {item.icon}
              <span className="font-medium">{item.total} {item.label}</span>
              <span className="text-muted-foreground">
                ({item.detail})
              </span>
              {item.hasError && (
                <Badge variant="destructive" className="text-[10px] px-1.5">!</Badge>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
