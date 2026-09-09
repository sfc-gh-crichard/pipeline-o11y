"use client"

import { useSearchParams } from "next/navigation"
import { Suspense } from "react"
import { PipelineFlow } from "@/components/pipeline/pipeline-flow"

function PipelineContent() {
  const searchParams = useSearchParams()
  const highlightFqn = searchParams.get("highlight")

  return <PipelineFlow highlightFqn={highlightFqn} />
}

export default function PipelinePage() {
  return (
    <main className="flex flex-col h-[calc(100vh-3.5rem)]">
      <Suspense>
        <PipelineContent />
      </Suspense>
    </main>
  )
}
