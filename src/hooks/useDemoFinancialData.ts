import { useMemo, useState } from 'react'
import {
  Transaction,
  Account,
  Category,
  FinancialSummary,
  CategoryBreakdown,
  TimeSeriesData,
  DateRange,
  TransactionType,
  Budget,
  BudgetProgress,
} from '../types/financial'
import { demoTransactions, demoAccounts, demoCategories, demoBudgets, DEMO_USER_ID } from '../data/demoData'
import { buildCategoryBreakdown, buildTimeSeries, sumBalance } from '../utils/transfers'

export const useDemoFinancialData = (dateRange: DateRange | null) => {
  const [loading, setLoading] = useState(false)
  const error: string | null = null

  // Filter transactions by date range
  const filteredTransactions = useMemo(() => {
    if (!dateRange) return demoTransactions

    return demoTransactions.filter(t => {
      const txDate = new Date(t.occurred_at)
      return txDate >= dateRange.start && txDate <= dateRange.end
    })
  }, [dateRange])

  const refresh = async () => {
    // Demo mode - no actual refresh needed
    setLoading(true)
    setTimeout(() => setLoading(false), 300)
  }

  // Mock add transaction (doesn't actually save)
  const addTransaction = async (transaction: Omit<Transaction, 'id' | 'created_at' | 'account' | 'category'>) => {
    // In demo mode, we don't actually save
    return {
      ...transaction,
      id: `demo-tx-${Date.now()}`,
      created_at: new Date().toISOString(),
      account: demoAccounts.find(a => a.id === transaction.account_id) || null,
      category: demoCategories.find(c => c.id === transaction.category_id)!,
      user_id: DEMO_USER_ID,
    } as Transaction
  }

  const addTransfer = async (_values: unknown, _transferId: string) => {
    // In demo mode, we don't actually save
    return Promise.resolve(`demo-transfer-${Date.now()}`)
  }

  const updateTransaction = async (id: string, updates: Partial<Transaction>) => {
    // In demo mode, we don't actually update
    return {
      ...demoTransactions[0],
      ...updates,
      id,
    } as Transaction
  }

  const deleteTransaction = async (_id: string) => {
    // In demo mode, we don't actually delete
    return Promise.resolve()
  }

  const addAccount = async (name: string, currency: string = 'IDR') => {
    return {
      id: `demo-acc-${Date.now()}`,
      name,
      currency,
      created_at: new Date().toISOString(),
    } as Account
  }

  const deleteAccount = async (_id: string) => Promise.resolve()

  const addCategory = async (name: string, allowed_type: 'income' | 'outcome' | 'both' = 'both') => {
    return {
      id: `demo-cat-${Date.now()}`,
      name,
      allowed_type,
      created_at: new Date().toISOString(),
    } as Category
  }

  const deleteCategory = async (_id: string) => Promise.resolve()

  const addBudget = async (budget: Omit<Budget, 'id' | 'created_at' | 'category'>) => {
    return {
      ...budget,
      id: `demo-budget-${Date.now()}`,
      created_at: new Date().toISOString(),
      category: demoCategories.find(c => c.id === budget.category_id) || null,
    } as Budget
  }

  const updateBudget = async (id: string, updates: Partial<Budget>) => {
    return {
      ...demoBudgets[0],
      ...updates,
      id,
    } as Budget
  }

  const deleteBudget = async (_id: string) => {
    return Promise.resolve()
  }

  // Calculate financial summary
  const getFinancialSummary = (): FinancialSummary => {
    const income = filteredTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + Number(t.amount), 0)

    const outcome = filteredTransactions
      .filter(t => t.type === 'outcome')
      .reduce((sum, t) => sum + Number(t.amount), 0)

    const netBalance = income - outcome
    const accountBalance = sumBalance(filteredTransactions)

    return {
      totalIncome: income,
      totalOutcome: outcome,
      netBalance,
      accountBalance,
    }
  }

  const getFinancialSummaryForDateRange = (_range: DateRange | null): FinancialSummary => {
    return getFinancialSummary()
  }

  // Get category breakdown
  const getCategoryBreakdown = (type?: TransactionType, _range?: DateRange | null): CategoryBreakdown[] => {
    return buildCategoryBreakdown(filteredTransactions, type)
  }

  // Get time series data
  const getTimeSeriesData = (_range?: DateRange | null): TimeSeriesData[] => {
    return buildTimeSeries(filteredTransactions)
  }

  // Get budget progress
  const getBudgetProgress = (range?: DateRange | null): BudgetProgress[] => {
    if (!range) return []

    return demoBudgets.map(budget => {
      const filtered = filteredTransactions.filter(
        t => t.category_id === budget.category_id
      )

      const outcome = filtered
        .filter(t => t.type === 'outcome')
        .reduce((sum, t) => sum + Number(t.amount), 0)

      const income = filtered
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + Number(t.amount), 0)

      const spent = outcome - income
      const remaining = budget.amount - spent
      const percentage = budget.amount > 0 ? (spent / budget.amount) * 100 : 0
      const isOverBudget = spent > budget.amount

      return {
        budget,
        spent,
        remaining,
        percentage: Math.min(percentage, 100),
        isOverBudget,
      }
    })
  }

  return {
    transactions: filteredTransactions,
    accounts: demoAccounts,
    categories: demoCategories,
    budgets: demoBudgets,
    loading,
    error,
    refresh,
    addTransaction,
    addTransfer,
    updateTransaction,
    deleteTransaction,
    addAccount,
    deleteAccount,
    addCategory,
    deleteCategory,
    addBudget,
    updateBudget,
    deleteBudget,
    getFinancialSummary,
    getFinancialSummaryForDateRange,
    getCategoryBreakdown,
    getTimeSeriesData,
    getBudgetProgress,
  }
}
