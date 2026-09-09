"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Copy, Check, Tag, Info, Link2, ExternalLink } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DEFAULT_TAG,
  TAG_DATABASE,
  TAG_SCHEMA,
  TAG_FQN,
} from "@/lib/constants"

interface ConfigData {
  tag: { database: string; schema: string; name: string; fqn: string }
  taggedObjects: {
    database: string
    schema: string
    name: string
    objectType: string
    tagValue: string
  }[]
  taggedCount: number
}

async function fetchConfig(): Promise<ConfigData> {
  const res = await fetch("/api/config")
  if (!res.ok) throw new Error("Failed to fetch config")
  return res.json()
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      {copied ? "Copied" : "Copy"}
    </button>
  )
}

const COCO_PROMPTS = [
  {
    title: "Tag all objects in a database",
    prompt: `Tag every table, dynamic table, view, task, stream, and stage in DATABASE_NAME with the tag ${TAG_FQN} = 'pipeline-name'. Use ALTER ... SET TAG syntax for each object.`,
  },
  {
    title: "Tag a specific pipeline",
    prompt: `Tag the following objects with ${TAG_FQN} = 'my-pipeline': DATABASE.SCHEMA.TABLE_1, DATABASE.SCHEMA.DT_1, DATABASE.SCHEMA.TASK_1. Use ALTER ... SET TAG for each.`,
  },
  {
    title: "Create the tag if it doesn't exist",
    prompt: `CREATE TAG IF NOT EXISTS ${TAG_FQN} ALLOWED_VALUES 'lpr', 'cms', 'shared' COMMENT = 'Pipeline observability tag for Pipeline O11Y app';`,
  },
  {
    title: "Find all untagged objects",
    prompt: `List all dynamic tables and tasks in DATABASE_NAME that do NOT have the tag ${TAG_FQN} set. Use INFORMATION_SCHEMA and TAG_REFERENCES to find them.`,
  },
]

export default function SetupPage() {
  const { data, isLoading, error } = useQuery<ConfigData>({
    queryKey: ["config"],
    queryFn: fetchConfig,
    refetchInterval: 60_000,
  })

  return (
    <main className="w-full py-8 px-4 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Setup</h1>
        <p className="text-muted-foreground mt-1">
          Configure how Pipeline O11Y discovers and monitors your pipeline
          objects.
        </p>
      </div>

      {/* Tag Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-[var(--brand-primary)]" />
            <CardTitle className="text-lg">Tag Configuration</CardTitle>
          </div>
          <CardDescription>
            Pipeline O11Y discovers objects by looking for Snowflake objects
            tagged with a specific tag. By default, this is{" "}
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
              {TAG_FQN}
            </code>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Database
              </label>
              <Input value={TAG_DATABASE} disabled />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Schema
              </label>
              <Input value={TAG_SCHEMA} disabled />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Tag Name
              </label>
              <Input value={DEFAULT_TAG} disabled />
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50">
            {isLoading ? (
              <Skeleton className="h-5 w-48" />
            ) : error ? (
              <span className="text-sm text-muted-foreground">
                Could not load tag info.
              </span>
            ) : (
              <>
                <Badge variant="secondary">
                  {data?.taggedCount ?? 0} objects tagged
                </Badge>
                <span className="text-sm text-muted-foreground">
                  Set environment variables{" "}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">
                    O11Y_TAG_DATABASE
                  </code>
                  ,{" "}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">
                    O11Y_TAG_SCHEMA
                  </code>
                  ,{" "}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">
                    DEFAULT_O11Y_TAG
                  </code>{" "}
                  to change.
                </span>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* CoCo Prompts */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ExternalLink className="h-5 w-5 text-[var(--brand-primary)]" />
            <CardTitle className="text-lg">CoCo Prompts</CardTitle>
          </div>
          <CardDescription>
            Copy these prompts into Cortex Code to quickly tag your pipeline
            objects for discovery.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {COCO_PROMPTS.map((p) => (
            <div key={p.title} className="border rounded-md p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{p.title}</span>
                <CopyButton text={p.prompt} />
              </div>
              <pre className="text-xs bg-muted p-2 rounded-md overflow-x-auto whitespace-pre-wrap">
                {p.prompt}
              </pre>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* App Instructions */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Info className="h-5 w-5 text-[var(--brand-primary)]" />
            <CardTitle className="text-lg">How It Works</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <div>
            <h3 className="font-medium text-foreground">Home Dashboard</h3>
            <p>
              Shows KPI cards with overall pipeline health — total objects,
              healthy percentage, warnings, and errors. Below, a status grid
              groups objects by pipeline with color-coded dots. Click any dot to
              jump to the pipeline view.
            </p>
          </div>
          <div>
            <h3 className="font-medium text-foreground">
              Pipeline Visualization
            </h3>
            <p>
              Interactive DAG view of your pipeline. Nodes are auto-discovered
              from dynamic table dependencies, task predecessors, and stream
              links. Nodes are color-coded by health. Click a node to see
              refresh history and error details.
            </p>
          </div>
          <div>
            <h3 className="font-medium text-foreground">Alert History</h3>
            <p>
              View recent alert events — when they triggered, what condition
              fired, and the result. Filter by severity and date range.
            </p>
          </div>
          <div>
            <h3 className="font-medium text-foreground">Create Alerts</h3>
            <p>
              Build Snowflake ALERT objects from templates. Pick an object and
              condition (e.g., &quot;DT refresh fails&quot;), set a schedule,
              preview the SQL, and execute. The alert is created and resumed in
              one step.
            </p>
          </div>
          <div>
            <h3 className="font-medium text-foreground">Setup (this page)</h3>
            <p>
              Configure the tag used for discovery, view tagged object counts,
              and use CoCo prompts to quickly tag your pipeline objects.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Tagged Objects Table */}
      {data && data.taggedObjects.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-[var(--brand-primary)]" />
              <CardTitle className="text-lg">Tagged Objects</CardTitle>
            </div>
            <CardDescription>
              Objects currently discovered by the{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">
                {TAG_FQN}
              </code>{" "}
              tag.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-4 font-medium text-muted-foreground">
                      Object
                    </th>
                    <th className="py-2 pr-4 font-medium text-muted-foreground">
                      Type
                    </th>
                    <th className="py-2 font-medium text-muted-foreground">
                      Tag Value
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.taggedObjects.map((obj) => (
                    <tr
                      key={`${obj.database}.${obj.schema}.${obj.name}`}
                      className="border-b last:border-0"
                    >
                      <td className="py-2 pr-4 font-mono text-xs">
                        {obj.database}.{obj.schema}.{obj.name}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge variant="outline" className="text-xs">
                          {obj.objectType}
                        </Badge>
                      </td>
                      <td className="py-2 text-muted-foreground">
                        {obj.tagValue || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  )
}
