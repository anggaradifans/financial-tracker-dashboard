import { useCallback, useEffect, useRef, useState } from 'react'
import { supabaseRest } from '../lib/supabaseRest'
import { FinancialGoal } from '../types/financial'
import { CurrentWealthEntry, WealthEntry, WealthSaveInput, WealthSnapshot, WealthValuation } from '../types/wealth'

async function allRows<T>(table: string, userId: string, order: string, filter?: { currency: string; archived: boolean }): Promise<T[]> {
  const rows: T[] = []
  for (let offset = 0; ; offset += 500) {
    const page = await supabaseRest.select<T>(table, { select: '*', eq: { user_id: userId, ...filter }, order, limit: 500, offset })
    rows.push(...page)
    if (page.length < 500) return rows
  }
}

export function loadCurrentWealth(userId: string, currency?: string) {
  return allRows<CurrentWealthEntry>('wealth_current', userId, 'name.asc,id.asc',
    currency ? { currency, archived: false } : undefined)
}

export function useNetWorth(userId: string) {
  const [entries, setEntries] = useState<CurrentWealthEntry[]>([])
  const [archived, setArchived] = useState<WealthEntry[]>([])
  const [valuations, setValuations] = useState<WealthValuation[]>([])
  const [snapshots, setSnapshots] = useState<WealthSnapshot[]>([])
  const [goals, setGoals] = useState<FinancialGoal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const request = useRef(0)

  const refresh = useCallback(async () => {
    const version = ++request.current
    setLoading(true)
    setError(null)
    try {
      const [current, entryRows, history, snapshotRows, goalRows] = await Promise.all([
        loadCurrentWealth(userId),
        allRows<WealthEntry>('wealth_entries', userId, 'name.asc,id.asc'),
        allRows<WealthValuation>('wealth_valuations', userId, 'recorded_at.desc,id.desc'),
        supabaseRest.select<WealthSnapshot>('wealth_snapshots', { select: '*', eq: { user_id: userId }, order: 'captured_at.desc,id.desc', limit: 50 }),
        allRows<FinancialGoal>('goals', userId, 'name.asc,id.asc'),
      ])
      if (request.current !== version) return
      setEntries(current)
      setArchived(entryRows.filter(entry => entry.archived))
      setValuations(history)
      setSnapshots(snapshotRows)
      setGoals(goalRows)
    } catch {
      if (request.current === version) setError('Could not load your balance sheet. Check your connection and try again.')
      throw new Error('Could not refresh your balance sheet. If you just saved a change, it may already be recorded. Retry loading to check.')
    } finally {
      if (request.current === version) setLoading(false)
    }
  }, [userId])

  const invalidate = useCallback(() => { request.current++ }, [])
  useEffect(() => {
    void refresh().catch(() => {})
    return invalidate
  }, [refresh, invalidate])

  const save = async (entry: WealthSaveInput, revisionId: string) => {
    await supabaseRest.rpc('save_wealth_entry', { p_entry: entry, p_revision_id: revisionId })
    await refresh()
  }
  const archive = async (entryId: string, isArchived: boolean) => {
    await supabaseRest.rpc('archive_wealth_entry', { p_entry_id: entryId, p_archived: isArchived })
    await refresh()
  }
  const capture = async (snapshotId: string) => {
    await supabaseRest.rpc('capture_wealth_snapshot', { p_snapshot_id: snapshotId })
    await refresh()
  }
  return { entries, archived, valuations, snapshots, goals, loading, error, refresh, save, archive, capture }
}
