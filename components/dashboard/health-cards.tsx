"use client"

import { useQuery } from "@tanstack/react-query"
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Layers,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useSilenced } from "@/components/silenced-provider"
import type { HealthSummary } from "@/lib/types"

async function fetchHealth(): Promise<HealthSummary> {
  const res = await fetch("/api/health")
  if (!res.ok) throw new Error("Failed to fetch health data")
  return res.json()
}

function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
}: {
  title: string
  value: number | string
  subtitle?: string
  icon: React.ElementType
  color: string
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4" style={{ color }} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  )
}

function KpiSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-4 rounded-full" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-3 w-32 mt-2" />
      </CardContent>
    </Card>
  )
}

export function HealthCards() {
  const { data, isLoading, error } = useQuery<HealthSummary>({
    queryKey: ["health-summary"],
    queryFn: fetchHealth,
    refetchInterval: 30_000,
  })
  const { silencedFqns } = useSilenced()

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <KpiSkeleton key={i} />
        ))}
      </div>
    )
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground">
            Unable to load health data.{" "}
            {error instanceof Error ? error.message : ""}
          </p>
        </CardContent>
      </Card>
    )
  }

  const silencedAdjust = silencedFqns.size
  const adjustedTotal = Math.max(data.totalObjects - silencedAdjust, 1)
  const adjustedHealthy = data.healthyCount
  const adjustedErrors = Math.max(data.errorCount - silencedAdjust, 0)

  const healthPct = Math.round((adjustedHealthy / adjustedTotal) * 100)

  const byTypeEntries = Object.entries(data.byType)
  const typeSubtitle = byTypeEntries
    .map(([type, counts]) => `${counts.total} ${type.replace("_", " ").toLowerCase()}s`)
    .join(", ")

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      <KpiCard
        title="Total Objects"
        value={data.totalObjects}
        subtitle={typeSubtitle}
        icon={Layers}
        color="var(--brand-primary)"
      />
      <KpiCard
        title="Healthy"
        value={`${healthPct}%`}
        subtitle={`${data.healthyCount} of ${data.totalObjects} objects`}
        icon={CheckCircle2}
        color="var(--status-healthy)"
      />
      <KpiCard
        title="Warnings"
        value={data.warningCount}
        subtitle="Stale streams or cancelled refreshes"
        icon={AlertTriangle}
        color="var(--status-warning)"
      />
      <KpiCard
        title="Errors"
        value={adjustedErrors}
        subtitle={silencedAdjust > 0 ? `${data.errorCount} total, ${silencedAdjust} silenced` : "Failed refreshes or tasks"}
        icon={XCircle}
        color="var(--status-error)"
      />
      <KpiCard
        title="Active Alerts"
        value={data.recentFailures.length}
        subtitle="Recent failures detected"
        icon={Activity}
        color="var(--brand-primary)"
      />
    </div>
  )
}
