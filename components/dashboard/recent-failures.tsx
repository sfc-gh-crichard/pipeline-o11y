"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { XCircle, ExternalLink } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import type { HealthSummary } from "@/lib/types"

async function fetchHealth(): Promise<HealthSummary> {
  const res = await fetch("/api/health")
  if (!res.ok) throw new Error("Failed to fetch health data")
  return res.json()
}

export function RecentFailures() {
  const { data, isLoading, error } = useQuery<HealthSummary>({
    queryKey: ["health-summary"],
    queryFn: fetchHealth,
    refetchInterval: 30_000,
  })

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Failures</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-64" />
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
          <p className="text-sm text-muted-foreground">
            Unable to load failure data.
          </p>
        </CardContent>
      </Card>
    )
  }

  const failures = data.recentFailures

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          Recent Failures
          {failures.length > 0 && (
            <Badge variant="destructive" className="ml-2 text-xs">
              {failures.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {failures.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No recent failures — all clear.
          </p>
        ) : (
          <div className="space-y-3">
            {failures.map((f, i) => {
              const fqn = `${f.database}.${f.schema}.${f.name}`
              const timeAgo = f.startedAt
                ? formatDistanceToNow(new Date(f.startedAt), {
                    addSuffix: true,
                  })
                : "unknown"
              return (
                <div
                  key={`${fqn}-${i}`}
                  className="flex items-start gap-3 p-3 rounded-md border bg-[var(--status-error-bg)]"
                >
                  <XCircle className="h-5 w-5 text-[var(--status-error)] mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">
                        {f.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {timeAgo}
                      </span>
                    </div>
                    {f.stateMessage && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {f.stateMessage}
                      </p>
                    )}
                  </div>
                  <Link
                    href={`/pipeline?highlight=${encodeURIComponent(fqn)}`}
                    className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
