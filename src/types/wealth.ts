export type WealthKind = 'asset' | 'liability'
export type WealthClassification = 'investable' | 'emergency_reserve' | 'primary_residence' | 'other'
export type WealthCategory = 'property' | 'land' | 'cash' | 'deposit' | 'stocks' | 'fund' | 'bond' | 'mortgage' | 'loan' | 'credit_card' | 'other'

export interface WealthEntry {
  id: string
  user_id: string
  name: string
  kind: WealthKind
  category: WealthCategory
  classification: WealthClassification
  currency: string
  account_id: string | null
  goal_id: string | null
  notes: string | null
  archived: boolean
  created_at: string
  updated_at: string
}

export interface CurrentWealthEntry extends WealthEntry {
  revision_id: string | null
  amount: number | null
  effective_kind: WealthKind
  valued_on: string | null
  source: 'manual' | 'account'
  missing_value: boolean
  stale: boolean
  account_name: string | null
  goal_name: string | null
}

export interface WealthValuation {
  id: string
  entry_id: string
  user_id: string
  amount: number | null
  valued_on: string | null
  recorded_at: string
  request: WealthSaveInput
}

export interface WealthTotal {
  currency: string
  assets: number
  liabilities: number
  net_worth: number
  investable: number
  missing_count: number
  stale_count: number
}

export interface WealthSnapshot {
  id: string
  user_id: string
  captured_at: string
  totals: WealthTotal[]
  entries: CurrentWealthEntry[]
}

export interface WealthSaveInput {
  id: string
  name: string
  kind: WealthKind
  category: WealthCategory
  classification: WealthClassification
  currency: string
  account_id: string | null
  goal_id: string | null
  notes: string | null
  amount: number | null
  valued_on: string | null
  expected_updated_at: string | null
}
