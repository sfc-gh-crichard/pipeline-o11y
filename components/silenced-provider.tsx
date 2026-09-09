"use client"

import { createContext, useCallback, useContext, useState, useEffect } from "react"

interface SilencedContextValue {
  silencedFqns: Set<string>
  silence: (fqn: string) => void
  unsilence: (fqn: string) => void
  isSilenced: (fqn: string) => boolean
  clearAll: () => void
}

const SilencedContext = createContext<SilencedContextValue>({
  silencedFqns: new Set(),
  silence: () => {},
  unsilence: () => {},
  isSilenced: () => false,
  clearAll: () => {},
})

export function useSilenced() {
  return useContext(SilencedContext)
}

const STORAGE_KEY = "o11y-silenced-objects"

export function SilencedProvider({ children }: { children: React.ReactNode }) {
  const [silencedFqns, setSilencedFqns] = useState<Set<string>>(new Set())

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) setSilencedFqns(new Set(JSON.parse(stored)))
    } catch { /* ignore */ }
  }, [])

  const persist = useCallback((fqns: Set<string>) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...fqns]))
  }, [])

  const silence = useCallback((fqn: string) => {
    setSilencedFqns((prev) => {
      const next = new Set(prev)
      next.add(fqn)
      persist(next)
      return next
    })
  }, [persist])

  const unsilence = useCallback((fqn: string) => {
    setSilencedFqns((prev) => {
      const next = new Set(prev)
      next.delete(fqn)
      persist(next)
      return next
    })
  }, [persist])

  const isSilenced = useCallback((fqn: string) => silencedFqns.has(fqn), [silencedFqns])

  const clearAll = useCallback(() => {
    setSilencedFqns(new Set())
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  return (
    <SilencedContext.Provider value={{ silencedFqns, silence, unsilence, isSilenced, clearAll }}>
      {children}
    </SilencedContext.Provider>
  )
}
