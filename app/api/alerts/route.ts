import {
  getAlertHistory,
  getAlerts,
  createAlert,
  suspendAlert,
  resumeAlert,
  dropAlert,
  buildCreateAlertSQL,
  type CreateAlertParams,
} from "@/lib/queries/alert-queries"
import { querySnowflake } from "@/lib/snowflake"
import {
  buildCreateAlertSql,
  type CreateAlertParams as TemplateParams,
} from "@/lib/queries/alert-templates"
import { TAG_DATABASE } from "@/lib/constants"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get("action")
    const database = searchParams.get("database") ?? TAG_DATABASE

    if (action === "list") {
      const alerts = await getAlerts(database)
      return Response.json(alerts)
    }

    if (action === "counts") {
      // Return monitored object counts for the summary bar
      const alerts = await getAlerts(database)
      return Response.json({
        counts: {
          alerts: { total: alerts.length, active: alerts.filter((a) => a.state === "started").length, triggered: 0 },
        },
      })
    }

    const limit = parseInt(searchParams.get("limit") ?? "100", 10)
    const history = await getAlertHistory(limit)
    return Response.json({ history })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error"
    return Response.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    if (body.action === "suspend") {
      await suspendAlert(body.database, body.schema, body.name)
      return Response.json({ success: true })
    }

    if (body.action === "resume") {
      await resumeAlert(body.database, body.schema, body.name)
      return Response.json({ success: true })
    }

    if (body.action === "drop") {
      await dropAlert(body.database, body.schema, body.name)
      return Response.json({ success: true })
    }

    // Create alert from template params
    if (body.conditionSql && body.actionSql) {
      const sql = buildCreateAlertSql(body as TemplateParams)
      const statements = sql.split(";").filter((s: string) => s.trim())
      for (const stmt of statements) {
        await querySnowflake(stmt)
      }
      return Response.json({ success: true, message: "Alert created and resumed." })
    }

    // Legacy: create from old params
    if (body.condition && body.action_sql) {
      await createAlert(body as CreateAlertParams)
      return Response.json({ success: true })
    }

    return Response.json({ error: "Invalid request" }, { status: 400 })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error"
    return Response.json({ error: message }, { status: 500 })
  }
}
