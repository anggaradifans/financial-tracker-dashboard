import { useState, useEffect, useMemo } from 'react'
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
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns'

export const useDemoFinancialData = (dateRange: DateRange | null) => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const updateTransaction = async (id: string, updates: Partial<Transaction>) => {
    // In demo mode, we don't actually update
    return {
      ...demoTransactions[0],
      ...updates,
      id,
    } as Transaction
  }

  const deleteTransaction = async (id: string) => {
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

  const addCategory = async (name: string, allowed_type: 'income' | 'outcome' | 'both' = 'both') => {
    return {
      id: `demo-cat-${Date.now()}`,
      name,
      allowed_type,
      created_at: new Date().toISOString(),
    } as Category
  }

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

  const deleteBudget = async (id: string) => {
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
    const accountBalance = filteredTransactions.reduce((sum, t) => {
      return sum + (t.type === 'income' ? Number(t.amount) : -Number(t.amount))
    }, 0)

    return {
      totalIncome: income,
      totalOutcome: outcome,
      netBalance,
      accountBalance,
    }
  }

  const getFinancialSummaryForDateRange = (range: DateRange | null): FinancialSummary => {
    return getFinancialSummary()
  }

  // Get category breakdown
  const getCategoryBreakdown = (type?: TransactionType, range?: DateRange | null): CategoryBreakdown[] => {
    let filtered = filteredTransactions
    if (type) {
      filtered = filtered.filter(t => t.type === type)
    }

    const breakdown = filtered.reduce((acc, t) => {
      const categoryId = t.category_id
      const categoryName = t.category?.name || 'Unknown'
      const key = `${categoryId}-${t.type}`

      if (!acc[key]) {
        acc[key] = {
          category_id: categoryId,
          category_name: categoryName,
          amount: 0,
          count: 0,
          type: t.type,
        }
      }

      acc[key].amount += Number(t.amount)
      acc[key].count += 1
      return acc
    }, {} as Record<string, CategoryBreakdown>)

    return Object.values(breakdown).sort((a, b) => b.amount - a.amount)
  }

  // Get time series data
  const getTimeSeriesData = (range?: DateRange | null): TimeSeriesData[] => {
    const grouped = filteredTransactions.reduce((acc, t) => {
      const date = new Date(t.occurred_at).toISOString().split('T')[0]

      if (!acc[date]) {
        acc[date] = { date, income: 0, outcome: 0, net: 0 }
      }

      if (t.type === 'income') {
        acc[date].income += Number(t.amount)
      } else {
        acc[date].outcome += Number(t.amount)
      }
      acc[date].net = acc[date].income - acc[date].outcome

      return acc
    }, {} as Record<string, TimeSeriesData>)

    return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date))
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
    updateTransaction,
    deleteTransaction,
    addAccount,
    addCategory,
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

