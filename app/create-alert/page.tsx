"use client"

import { Suspense } from "react"
import { AlertForm } from "@/components/alerts/alert-form"

export default function CreateAlertPage() {
  return (
    <main className="w-full py-6 px-4 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Create Alert</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Monitor your pipeline objects and get notified when something breaks.
        </p>
      </div>
      <Suspense>
        <AlertForm />
      </Suspense>
    </main>
  )
}
