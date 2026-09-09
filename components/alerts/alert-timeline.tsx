"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { AlertEvent } from "@/lib/types"
import { formatDistanceToNow } from "date-fns"
import { AlertTriangle, CheckCircle, Info, XCircle } from "lucide-react"

function severityIcon(severity: AlertEvent["severity"]) {
  switch (severity) {
    case "emergency":
      return <XCircle className="h-4 w-4 text-red-500" />
    case "warning":
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />
    default:
      return <Info className="h-4 w-4 text-blue-500" />
  }
}

function severityBadgeVariant(severity: AlertEvent["severity"]) {
  switch (severity) {
    case "emergency":
      return "destructive" as const
    case "warning":
      return "default" as const
    default:
      return "secondary" as const
  }
}

function stateLabel(state: string) {
  switch (state) {
    case "TRIGGERED":
      return "Triggered"
    case "CONDITION_FALSE":
      return "Condition False"
    case "CONDITION_FAILED":
      return "Condition Failed"
    case "ACTION_FAILED":
      return "Action Failed"
    default:
      return state
  }
}

interface AlertTimelineProps {
  events: AlertEvent[]
  loading?: boolean
}

export function AlertTimeline({ events, loading }: AlertTimelineProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Alert History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (events.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Alert History</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No alert events found. Alert history is sourced from
            SERVERLESS_ALERT_HISTORY (365-day retention).
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Alert History</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {events.map((event, i) => {
            const ts = new Date(event.scheduledTime)
            const ago = formatDistanceToNow(ts, { addSuffix: true })

            return (
              <div
                key={`${event.alertName}-${event.scheduledTime}-${i}`}
                className="flex items-start gap-3 rounded-md border p-3 hover:bg-accent/50 transition-colors"
              >
                <div className="mt-0.5">{severityIcon(event.severity)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">
                      {event.alertName}
                    </span>
                    <Badge variant={severityBadgeVariant(event.severity)} className="text-[10px]">
                      {event.severity}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {stateLabel(event.state)}
                    </Badge>
                  </div>
                  {event.actionResult && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {event.actionResult}
                    </p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {ago}
                </span>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
