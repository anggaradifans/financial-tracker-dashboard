export type TransactionType = 'income' | 'outcome'
export type CategoryAllowedType = 'income' | 'outcome' | 'both'

export interface Transaction {
  id: string
  account_id?: string | null
  category_id: string
  type: TransactionType
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
