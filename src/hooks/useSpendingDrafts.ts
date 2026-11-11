import { useState } from 'react'
import type { SpendingDraft, SpendingDrafts } from '../utils/spendingOpportunities'

export function useSpendingDrafts(): SpendingDrafts {
  const [drafts, setDrafts] = useState<Record<string, SpendingDraft>>({})
  return {
    drafts,
    setDraft(currency, draft) {
      setDrafts(previous => ({ ...previous, [currency]: draft }))
    },
  }
}
