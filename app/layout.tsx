import type { Metadata } from "next"
import type React from "react"
import { AppHeader } from "@/components/app-header"
import { ThemeProvider } from "@/components/theme-provider"
import { QueryProvider } from "@/components/query-provider"
import { SilencedProvider } from "@/components/silenced-provider"
import { APP_TITLE, LOGO_SRC } from "@/lib/constants"
import "./globals.css"

export const metadata: Metadata = {
  title: APP_TITLE,
  description:
    "End-to-end pipeline health monitoring, visualization, and alerting for Snowflake.",
  icons: { icon: LOGO_SRC },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body className="antialiased">
        <ThemeProvider>
          <QueryProvider>
            <SilencedProvider>
              <AppHeader />
              {children}
            </SilencedProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
