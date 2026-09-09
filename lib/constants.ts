/** App title — displayed in the nav header and browser tab */
export const APP_TITLE = "Pipeline O11Y"

/** Path to the logo in /public (used in the header and as favicon) */
export const LOGO_SRC = "/icon.svg"

/** Default tag used to discover pipeline objects */
export const DEFAULT_TAG = process.env.DEFAULT_O11Y_TAG ?? "o11y"

/** Fully qualified tag reference */
export const TAG_DATABASE = process.env.O11Y_TAG_DATABASE ?? "LPR_POC"
export const TAG_SCHEMA = process.env.O11Y_TAG_SCHEMA ?? "OPS"
export const TAG_FQN = `${TAG_DATABASE}.${TAG_SCHEMA}.${DEFAULT_TAG.toUpperCase()}`

/** Status colors — used for pipeline node borders and status badges */
export const STATUS_COLORS = {
  healthy: "#22c55e",
  warning: "#eab308",
  error: "#ef4444",
  inactive: "#6b7280",
  unknown: "#6b7280",
} as const

/** Pipeline layer ordering (left to right in the DAG) */
export const LAYER_ORDER = [
  "STAGE",
  "STREAM",
  "BRONZE",
  "RAW",
  "SILVER",
  "GOLD",
  "PLATINUM",
  "APP",
  "SERVING",
] as const

export type PipelineLayer = (typeof LAYER_ORDER)[number]

/** Navigation tabs */
export const NAV_TABS = [
  { label: "Home", href: "/" },
  { label: "Pipeline", href: "/pipeline" },
  { label: "Alerts", href: "/alerts" },
  { label: "Create Alert", href: "/create-alert" },
  { label: "Setup", href: "/setup" },
] as const
