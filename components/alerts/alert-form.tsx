"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  CONDITION_TEMPLATES,
  buildCreateAlertSql,
  type CreateAlertParams,
} from "@/lib/queries/alert-templates"
import { TAG_DATABASE, TAG_SCHEMA } from "@/lib/constants"
import type { PipelineTopology, ObjectType } from "@/lib/types"
import { Loader2, Play, Eye, Copy, Bell, Trash2, Pause, PlayCircle } from "lucide-react"
import { useSearchParams } from "next/navigation"

const OBJECT_TYPE_OPTIONS: { value: ObjectType; label: string }[] = [
  { value: "DYNAMIC_TABLE", label: "Dynamic Table" },
  { value: "TASK", label: "Task" },
  { value: "STREAM", label: "Stream" },
]

export function AlertForm() {
  const searchParams = useSearchParams()
  const prefillFqn = searchParams.get("object") ?? ""
  const prefillType = searchParams.get("type") ?? ""

  const [objectType, setObjectType] = useState<string>(prefillType)
  const [objectFqn, setObjectFqn] = useState(prefillFqn)
  const [templateIdx, setTemplateIdx] = useState<string>("")
  const [threshold, setThreshold] = useState("")
  const [schedule, setSchedule] = useState("60")
  const [computeMode, setComputeMode] = useState<"serverless" | "warehouse">("serverless")
  const [warehouse, setWarehouse] = useState("")
  const [email, setEmail] = useState("")
  const [showPreview, setShowPreview] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  const { data: topology } = useQuery<PipelineTopology>({
    queryKey: ["topology"],
    queryFn: () => fetch("/api/topology").then((r) => r.json()),
    staleTime: 60_000,
  })

  const { data: existingAlerts, refetch: refetchAlerts } = useQuery<
    Array<{ name: string; database: string; schema: string; condition: string; state: string; schedule: string }>
  >({
    queryKey: ["existing-alerts"],
    queryFn: () => fetch(`/api/alerts?action=list&database=${TAG_DATABASE}`).then((r) => r.json()),
    staleTime: 30_000,
  })

  const selectedTemplate = templateIdx !== "" ? CONDITION_TEMPLATES[Number(templateIdx)] : null

  // Filter objects by selected type
  const availableObjects = topology
    ? topology.nodes.filter((n) => !objectType || n.objectType === objectType)
    : []

  // Filter conditions by selected type
  const availableConditions = objectType
    ? CONDITION_TEMPLATES.filter((t) => t.objectType === objectType)
    : CONDITION_TEMPLATES

  const autoName = objectFqn && selectedTemplate
    ? `O11Y_${objectFqn.split(".").pop()}_${selectedTemplate.label.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase().slice(0, 30)}`
    : ""

  function getPreviewSql(): string | null {
    if (!selectedTemplate || !objectFqn) return null
    const conditionSql = selectedTemplate.buildCondition(objectFqn, threshold || undefined)
    const actionSql = selectedTemplate.buildAction(email || "admin@example.com", objectFqn)
    return buildCreateAlertSql({
      name: autoName,
      database: TAG_DATABASE,
      schema: TAG_SCHEMA,
      warehouse: computeMode === "warehouse" && warehouse ? warehouse : null,
      schedule: `${schedule} MINUTE`,
      conditionSql,
      actionSql,
    })
  }

  async function handleSubmit() {
    if (!selectedTemplate || !objectFqn) return
    setSubmitting(true)
    setResult(null)
    const conditionSql = selectedTemplate.buildCondition(objectFqn, threshold || undefined)
    const actionSql = selectedTemplate.buildAction(email || "admin@example.com", objectFqn)
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: autoName,
          database: TAG_DATABASE,
          schema: TAG_SCHEMA,
          warehouse: computeMode === "warehouse" && warehouse ? warehouse : null,
          schedule: `${schedule} MINUTE`,
          conditionSql,
          actionSql,
        } satisfies CreateAlertParams),
      })
      const data = await res.json()
      if (res.ok) {
        setResult({ success: true, message: data.message ?? "Alert created and resumed." })
        refetchAlerts()
      } else {
        setResult({ success: false, message: data.error ?? "Failed to create alert." })
      }
    } catch (e) {
      setResult({ success: false, message: e instanceof Error ? e.message : "Request failed" })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAlertAction(action: "suspend" | "resume" | "drop", alertName: string) {
    try {
      await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, database: TAG_DATABASE, schema: TAG_SCHEMA, name: alertName }),
      })
      refetchAlerts()
    } catch { /* ignore */ }
  }

  const previewSql = getPreviewSql()
  const step = !objectType ? 1 : !objectFqn ? 2 : !templateIdx ? 3 : 4

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            New Alert
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">

          {/* Step 1: What type of object? */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Badge variant={step >= 1 ? "default" : "secondary"} className="text-[10px] w-5 h-5 flex items-center justify-center p-0">1</Badge>
              <label className="text-xs font-semibold">What type of object do you want to monitor?</label>
            </div>
            <div className="flex flex-wrap gap-2 ml-7">
              {OBJECT_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setObjectType(opt.value)
                    if (objectFqn && topology) {
                      const obj = topology.nodes.find((n) => n.fqn === objectFqn)
                      if (obj && obj.objectType !== opt.value) {
                        setObjectFqn("")
                        setTemplateIdx("")
                      }
                    }
                    setTemplateIdx("")
                  }}
                  className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                    objectType === opt.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card hover:bg-accent border-border"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Which specific object? */}
          {objectType && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Badge variant={step >= 2 ? "default" : "secondary"} className="text-[10px] w-5 h-5 flex items-center justify-center p-0">2</Badge>
                <label className="text-xs font-semibold">Which {objectType.replace(/_/g, " ").toLowerCase()}?</label>
              </div>
              <div className="ml-7">
                <Select value={objectFqn} onValueChange={setObjectFqn}>
                  <SelectTrigger>
                    <SelectValue placeholder={`Select a ${objectType.replace(/_/g, " ").toLowerCase()}...`} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableObjects.map((o) => (
                      <SelectItem key={o.fqn} value={o.fqn}>
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full shrink-0 ${
                            o.status === "healthy" ? "bg-[#22c55e]"
                            : o.status === "error" || o.status === "inactive" ? "bg-[#ef4444]"
                            : "bg-[#6b7280]"
                          }`} />
                          <span>{o.name}</span>
                          <span className="text-[10px] text-muted-foreground">{o.pipeline}.{o.schema}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Step 3: What condition? */}
          {objectFqn && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Badge variant={step >= 3 ? "default" : "secondary"} className="text-[10px] w-5 h-5 flex items-center justify-center p-0">3</Badge>
                <label className="text-xs font-semibold">What should trigger the alert?</label>
              </div>
              <div className="ml-7 space-y-2">
                {availableConditions.map((t, i) => {
                  const globalIdx = CONDITION_TEMPLATES.indexOf(t)
                  const isSelected = templateIdx === String(globalIdx)
                  return (
                    <button
                      key={globalIdx}
                      onClick={() => setTemplateIdx(String(globalIdx))}
                      className={`w-full text-left px-3 py-2 text-xs rounded-md border transition-colors ${
                        isSelected
                          ? "bg-primary/10 border-primary text-foreground"
                          : "bg-card hover:bg-accent border-border"
                      }`}
                    >
                      {t.label}
                    </button>
                  )
                })}
                {selectedTemplate?.thresholdLabel && (
                  <Input
                    className="mt-1"
                    placeholder={selectedTemplate.thresholdDefault}
                    value={threshold}
                    onChange={(e) => setThreshold(e.target.value)}
                  />
                )}
              </div>
            </div>
          )}

          {/* Step 4: Schedule + email */}
          {templateIdx && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="default" className="text-[10px] w-5 h-5 flex items-center justify-center p-0">4</Badge>
                <label className="text-xs font-semibold">Configure and create</label>
              </div>
              <div className="ml-7 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">Check every (minutes)</label>
                  <Input type="number" min="1" value={schedule} onChange={(e) => setSchedule(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">Email to notify</label>
                  <Input type="email" placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>

              <details className="ml-7 text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Advanced options</summary>
                <div className="mt-2 flex items-center gap-3">
                  <Select value={computeMode} onValueChange={(v) => setComputeMode(v as "serverless" | "warehouse")}>
                    <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="serverless">Serverless</SelectItem>
                      <SelectItem value="warehouse">Warehouse</SelectItem>
                    </SelectContent>
                  </Select>
                  {computeMode === "warehouse" && (
                    <Input className="w-[180px]" placeholder="COMPUTE_WH" value={warehouse} onChange={(e) => setWarehouse(e.target.value)} />
                  )}
                </div>
              </details>

              <Separator className="ml-7" />

              <div className="ml-7 flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowPreview(!showPreview)} disabled={!previewSql}>
                  <Eye className="h-3.5 w-3.5 mr-1.5" />
                  {showPreview ? "Hide SQL" : "Preview SQL"}
                </Button>
                <Button size="sm" onClick={handleSubmit} disabled={!previewSql || submitting}>
                  {submitting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1.5" />}
                  Create Alert
                </Button>
              </div>

              {result && (
                <div className={`ml-7 text-sm p-3 rounded-md ${result.success ? "bg-green-500/10 text-green-600 dark:text-green-400" : "bg-red-500/10 text-red-600 dark:text-red-400"}`}>
                  {result.message}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {showPreview && previewSql && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg">SQL Preview</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(previewSql)}>
              <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy
            </Button>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted p-4 rounded-md overflow-x-auto whitespace-pre-wrap font-mono">{previewSql}</pre>
          </CardContent>
        </Card>
      )}

      {/* Existing alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            Existing Alerts
            {existingAlerts && <Badge variant="secondary" className="text-[10px]">{existingAlerts.length}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!existingAlerts || existingAlerts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No alerts created yet.</p>
          ) : (
            <div className="space-y-2">
              {existingAlerts.map((alert) => (
                <div key={alert.name} className="flex items-center gap-3 p-3 rounded-md border">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{alert.name}</span>
                      <Badge className={`text-[9px] ${
                        alert.state === "started"
                          ? "bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/30"
                          : "bg-muted text-muted-foreground"
                      }`}>{alert.state}</Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{alert.schedule} · {alert.condition.slice(0, 80)}...</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {alert.state === "started" ? (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleAlertAction("suspend", alert.name)}>
                        <Pause className="h-3.5 w-3.5" />
                      </Button>
                    ) : (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleAlertAction("resume", alert.name)}>
                        <PlayCircle className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleAlertAction("drop", alert.name)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
