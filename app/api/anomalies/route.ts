import { detectAnomalies } from "@/lib/queries/anomalies"
import { cached } from "@/lib/cache"

export const dynamic = "force-dynamic"

const ANOMALY_TTL = 90_000 // 90s cache — anomaly queries are heavier

export async function GET() {
  try {
    const anomalies = await cached("anomalies", ANOMALY_TTL, detectAnomalies)
    return Response.json(anomalies)
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error"
    return Response.json({ error: message }, { status: 500 })
  }
}
