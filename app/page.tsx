import { HealthCards } from "@/components/dashboard/health-cards"
import { StatusGrid } from "@/components/dashboard/status-grid"
import { RecentFailures } from "@/components/dashboard/recent-failures"
import { AnomalyPanel } from "@/components/dashboard/anomaly-panel"

export const dynamic = "force-dynamic"

export default function Home() {
  return (
    <main className="w-full py-8 px-4 space-y-6">
      <HealthCards />
      <AnomalyPanel />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <StatusGrid />
        </div>
        <div>
          <RecentFailures />
        </div>
      </div>
    </main>
  )
}
