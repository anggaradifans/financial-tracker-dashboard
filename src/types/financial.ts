// What a person can enter or import.
export type TransactionType = 'income' | 'outcome'
// A transfer is stored as two linked legs: a debit and a credit. They are created
// and deleted only through the create_transfer / delete_transfer RPCs.
export type TransferLegType = 'transfer_out' | 'transfer_in'
// What a stored row can be.
export type StoredTransactionType = TransactionType | TransferLegType
export type CategoryAllowedType = 'income' | 'outcome' | 'both'

export interface Transaction {
  id: string
  account_id?: string | null
  // Only transfer legs have no category.
  category_id: string | null
  type: StoredTransactionType
  // Shared by the two legs of one transfer; null for ordinary transactions.
  transfer_id?: string | null
  amount: number
  currency: string
  description?: string | null
  occurred_at: string
  created_at: string
  metadata: Record<string, any>
  deleted_at?: string | null
  user_id?: string | null
  // Joined data
  account?: Account
  category?: Category
}

export interface Account {
  id: string
  name: string
  currency: string
  created_at: string
}

export interface Category {
  id: string
  user_id?: string | null
  name: string
  allowed_type: CategoryAllowedType
  created_at: string
}

export interface FinancialSummary {
  totalIncome: number
  totalOutcome: number
  netBalance: number
  accountBalance: number
}

export interface CategoryBreakdown {
  category_id: string
  category_name: string
  amount: number
  count: number
  type: TransactionType
}

export interface TimeSeriesData {
  date: string
  income: number
  outcome: number
  net: number
}

export type DateRange = {
  start: Date
  end: Date
}

export type PeriodFilter = 'today' | 'week' | 'month' | 'year' | 'custom'

export interface Budget {
  id: string
  category_id: string
  amount: number
  currency: string
  period: 'daily' | 'weekly' | 'monthly' | 'yearly'
  start_date: string
  end_date?: string | null
  created_at: string
  user_id?: string | null
  // Joined data
  categories?: Category
}

export interface BudgetProgress {
  budget: Budget
  spent: number
  remaining: number
  percentage: number
  isOverBudget: boolean
}

export type GoalKind = 'emergency_fund' | 'custom'
export type GoalStatus = 'active' | 'completed' | 'archived'

export interface FinancialGoal {
  id: string
  user_id: string
  kind: GoalKind
  name: string
  description: string | null
  currency: string
  target_amount: number
  target_date: string | null
  planned_monthly_amount: number | null
  status: GoalStatus
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface GoalProgress {
  goal_id: string
  currency: string
  target_amount: number
  saved_amount: number
  remaining_amount: number
  progress_percent: number
  contribution_count: number
  last_contributed_on: string | null
  recommendation_id: string | null
  average_monthly_essential: number | null
  months_of_coverage: number | null
}

export interface GoalContribution {
  id: string
  goal_id: string
  user_id: string
  contributed_on: string
  amount: number
  description: string | null
  transaction_id: string | null
  created_at: string
}

export interface GoalRecommendation {
  id: string
  goal_id: string
  basis_months: number
  multiplier: number
  period_start: string
  period_end: string
  computed_at: string
  included_month_count: number
  average_monthly_essential: number
  suggested_target: number
  accepted_target: number
  skipped_other_currency_count: number
  timezone: string
}

export interface GoalBasisMonth {
  month: string
  included: boolean
  exclusion_reason: 'no_data' | 'incomplete_history' | null
  included_spend: number
  excluded_spend: number
  refunds: number
  basis_amount: number
}

export interface GoalBasisCategory {
  category_id: string | null
  category_name: string
  included: boolean
  avg_monthly_amount: number
}

export interface EmergencyFundBasis {
  currency: string
  basis_months: number
  multiplier: number
  period_start: string
  period_end: string
  included_month_count: number
  min_months_required: number
  average_monthly_essential: number | null
  suggested_target: number | null
  skipped_other_currency_count: number
  months: GoalBasisMonth[]
  categories: GoalBasisCategory[]
}
