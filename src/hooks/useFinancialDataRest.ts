import { useState, useEffect } from 'react'
import { supabaseRest } from '../lib/supabaseRest'
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
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns'
import { devLog, devError } from '../utils/notifications'

export const useFinancialDataRest = (userId: string | undefined, dateRange: DateRange | null) => {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    devLog('[useFinancialDataRest] Fetching data...', userId ? `Filtering by userId: ${userId}` : 'Fetching all data')
    fetchAllData()
  }, [userId, dateRange])

  const fetchAllData = async () => {
    try {
      setLoading(true)
      setError(null)

      await Promise.all([
        fetchTransactions(),
        fetchAccounts(),
        fetchCategories(),
        fetchBudgets(),
      ])
    } catch (err) {
      devError('[useFinancialDataRest] Error fetching data:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch data'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const fetchTransactions = async () => {
    try {
      // Build query parameters for Supabase REST API
      const query: {
        select?: string
        eq?: Record<string, any>
        gte?: Record<string, string>
        lte?: Record<string, string>
        is?: Record<string, any>
        order?: string
      } = {
        select: '*,accounts(*),categories(*)',
        is: { deleted_at: null },
        order: 'occurred_at.desc',
      }

      // Filter by userId only if provided (optional with service_role key)
      if (userId) {
        query.eq = { user_id: userId }
      }

      // Always apply date range filter if provided
      if (dateRange) {
        query.gte = { occurred_at: dateRange.start.toISOString() }
        query.lte = { occurred_at: dateRange.end.toISOString() }
      }

      const data = await supabaseRest.select<Transaction>('transactions', query)

      // Transform the response to match the expected structure
      const transformedData = data.map((tx: any) => ({
        ...tx,
        account: tx.accounts || tx.account || null,
        category: tx.categories || tx.category || null,
      }))

      setTransactions(transformedData || [])
    } catch (err) {
      devError('[useFinancialDataRest] Error fetching transactions:', err)
      throw err
    }
  }

  const fetchAccounts = async () => {
    try {
      const data = await supabaseRest.select<Account>('accounts', {
        order: 'name.asc',
      })
      setAccounts(data || [])
    } catch (err) {
      devError('[useFinancialDataRest] Error fetching accounts:', err)
      throw err
    }
  }

  const fetchCategories = async () => {
    try {
      const data = await supabaseRest.select<any>('categories', {
        order: 'name.asc',
      })

      const mappedData = (data || []) as Category[]
      setCategories(mappedData)
    } catch (err) {
      devError('[useFinancialDataRest] Error fetching categories:', err)
      throw err
    }
  }

  const fetchBudgets = async () => {
    try {
      const query: any = {
        select: '*,categories(*)',
        order: 'created_at.desc',
      }

      if (userId) {
        query.eq = { user_id: userId }
      }

      const data = await supabaseRest.select<Budget>('budgets', query)
      const transformedData = data.map((budget: any) => ({
        ...budget,
        category: budget.categories || budget.category || null,
      }))
      setBudgets(transformedData || [])
    } catch (err) {
      devError('[useFinancialDataRest] Error fetching budgets:', err)
      // Budgets table might not exist yet, so don't throw error
      setBudgets([])
    }
  }

  const addTransaction = async (transaction: Omit<Transaction, 'id' | 'created_at' | 'account' | 'category'>) => {
    try {
      const dbTransaction = {
        ...transaction,
        type: transaction.type,
        user_id: userId || null,
      }
      
      const result = await supabaseRest.insert<Transaction[]>('transactions', dbTransaction)

      const rawData = Array.isArray(result) ? result[0] : result
      const data = rawData ? {
        ...rawData,
        type: rawData.type,
      } as Transaction : null
      
      if (data) {
        setTransactions(prev => [data, ...prev])
      }
      return data
    } catch (err) {
      devError('[useFinancialDataRest] Error adding transaction:', err)
      throw err
    }
  }

  const updateTransaction = async (id: string, updates: Partial<Transaction>) => {
    try {
      const dbUpdates = {
        ...updates,
        type: updates.type,
      }
      
      const result = await supabaseRest.update<any[]>('transactions', dbUpdates, { id })
      const rawData = Array.isArray(result) ? result[0] : result
      const data = rawData ? {
        ...rawData,
        type: rawData.type,
      } as Transaction : null

      if (data) {
        setTransactions(prev =>
          prev.map(t => t.id === id ? data : t)
        )
      }
      return data
    } catch (err) {
      devError('[useFinancialDataRest] Error updating transaction:', err)
      throw err
    }
  }

  const deleteTransaction = async (id: string) => {
    try {
      await supabaseRest.update('transactions', { deleted_at: new Date().toISOString() }, { id })
      setTransactions(prev => prev.filter(t => t.id !== id))
    } catch (err) {
      devError('[useFinancialDataRest] Error deleting transaction:', err)
      throw err
    }
  }

  const addAccount = async (name: string, currency: string = 'IDR') => {
    try {
      const result = await supabaseRest.insert<Account[]>('accounts', { name, currency })
      const data = Array.isArray(result) ? result[0] : result

      if (data) {
        setAccounts(prev => [...prev, data])
      }
      return data
    } catch (err) {
      devError('[useFinancialDataRest] Error adding account:', err)
      throw err
    }
  }

  const addCategory = async (name: string, allowed_type: 'income' | 'outcome' | 'both' = 'both') => {
    try {
      const result = await supabaseRest.insert<Category[]>('categories', { name, allowed_type })
      const data = Array.isArray(result) ? result[0] : result

      if (data) {
        setCategories(prev => [...prev, data])
      }
      return data
    } catch (err) {
      devError('[useFinancialDataRest] Error adding category:', err)
      throw err
    }
  }

  const addBudget = async (budget: Omit<Budget, 'id' | 'created_at' | 'category'>) => {
    try {
      const result = await supabaseRest.insert<Budget[]>('budgets', {
        ...budget,
        user_id: userId || null,
      })
      const data = Array.isArray(result) ? result[0] : result
      if (data) {
        setBudgets(prev => [...prev, data])
      }
      return data
    } catch (err) {
      devError('[useFinancialDataRest] Error adding budget:', err)
      throw err
    }
  }

  const updateBudget = async (id: string, updates: Partial<Budget>) => {
    try {
      const result = await supabaseRest.update<Budget[]>('budgets', updates, { id })
      const data = Array.isArray(result) ? result[0] : result
      if (data) {
        setBudgets(prev => prev.map(b => b.id === id ? data : b))
      }
      return data
    } catch (err) {
      devError('[useFinancialDataRest] Error updating budget:', err)
      throw err
    }
  }

  const deleteBudget = async (id: string) => {
    try {
      await supabaseRest.delete('budgets', { id })
      setBudgets(prev => prev.filter(b => b.id !== id))
    } catch (err) {
      devError('[useFinancialDataRest] Error deleting budget:', err)
      throw err
    }
  }

  // Calculate budget period end date based on period type and start date
  const getBudgetPeriodEndDate = (startDate: Date, period: 'daily' | 'weekly' | 'monthly' | 'yearly'): Date => {
    const endDate = new Date(startDate)
    
    switch (period) {
      case 'daily':
        endDate.setDate(endDate.getDate() + 1)
        break
      case 'weekly':
        endDate.setDate(endDate.getDate() + 7)
        break
      case 'monthly':
        endDate.setMonth(endDate.getMonth() + 1)
        break
      case 'yearly':
        endDate.setFullYear(endDate.getFullYear() + 1)
        break
    }
    
    // Subtract 1 day to get the last day of the period (inclusive)
    endDate.setDate(endDate.getDate() - 1)
    // Set to end of day
    endDate.setHours(23, 59, 59, 999)
    return endDate
  }

  // Get current budget period for a budget (calculates which period we're currently in)
  const getCurrentBudgetPeriod = (budget: Budget): DateRange => {
    const startDate = new Date(budget.start_date)
    const now = new Date()
    
    // Calculate which period we're currently in
    let periodStart = new Date(startDate)
    periodStart.setHours(0, 0, 0, 0)
    let periodEnd = getBudgetPeriodEndDate(periodStart, budget.period)
    
    // If we're past the current period, calculate the next period
    while (now > periodEnd) {
      periodStart = new Date(periodEnd)
      periodStart.setDate(periodStart.getDate() + 1)
      periodStart.setHours(0, 0, 0, 0)
      periodEnd = getBudgetPeriodEndDate(periodStart, budget.period)
    }
    
    return {
      start: periodStart,
      end: periodEnd,
    }
  }

  // Get budget progress for a given date range
  const getBudgetProgress = (range?: DateRange | null): BudgetProgress[] => {
    if (!range) return []

    return budgets.map(budget => {
      // Get the current budget period for this budget
      const budgetPeriod = getCurrentBudgetPeriod(budget)
      
      // Use the intersection of dashboard date range and budget period
      const effectiveStart = new Date(Math.max(range.start.getTime(), budgetPeriod.start.getTime()))
      const effectiveEnd = new Date(Math.min(range.end.getTime(), budgetPeriod.end.getTime()))
      
      // Filter transactions within the effective budget period
      let filteredTransactions = transactions.filter(t => {
        const txDate = new Date(t.occurred_at)
        return (
          txDate >= effectiveStart &&
          txDate <= effectiveEnd &&
          t.category_id === budget.category_id
        )
      })
      
      // Calculate outcome - income for this category
      const outcome = filteredTransactions
        .filter(t => t.type === 'outcome')
        .reduce((sum, t) => sum + Number(t.amount), 0)
      
      const income = filteredTransactions
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

  // Calculate financial summary (all data)
  const getFinancialSummary = (): FinancialSummary => {
    const income = transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + Number(t.amount), 0)

    const outcome = transactions
      .filter(t => t.type === 'outcome')
      .reduce((sum, t) => sum + Number(t.amount), 0)

    const netBalance = income - outcome

    const accountBalance = transactions.reduce((sum, t) => {
      return sum + (t.type === 'income' ? Number(t.amount) : -Number(t.amount))
    }, 0)

    return {
      totalIncome: income,
      totalOutcome: outcome,
      netBalance,
      accountBalance,
    }
  }

  // Calculate financial summary for current month only
  const getFinancialSummaryThisMonth = (): FinancialSummary => {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

    const thisMonthTransactions = transactions.filter(t => {
      const txDate = new Date(t.occurred_at)
      return txDate >= startOfMonth && txDate <= endOfMonth
    })

    const income = thisMonthTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + Number(t.amount), 0)

    const outcome = thisMonthTransactions
      .filter(t => t.type === 'outcome')
      .reduce((sum, t) => sum + Number(t.amount), 0)

    const netBalance = income - outcome

    const accountBalance = thisMonthTransactions.reduce((sum, t) => {
      return sum + (t.type === 'income' ? Number(t.amount) : -Number(t.amount))
    }, 0)

    return {
      totalIncome: income,
      totalOutcome: outcome,
      netBalance,
      accountBalance,
    }
  }

  // Calculate financial summary for a specific date range
  const getFinancialSummaryForDateRange = (range: DateRange | null): FinancialSummary => {
    if (!range) {
      // If no date range, use all transactions
      return getFinancialSummary()
    }

    const filteredTransactions = transactions.filter(t => {
      const txDate = new Date(t.occurred_at)
      return txDate >= range.start && txDate <= range.end
    })

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

  // Get category breakdown (optionally filtered by date range and type)
  const getCategoryBreakdown = (type?: TransactionType, range?: DateRange | null): CategoryBreakdown[] => {
    let filtered = transactions
    
    // Filter by date range if provided
    if (range) {
      filtered = filtered.filter(t => {
        const txDate = new Date(t.occurred_at)
        return txDate >= range.start && txDate <= range.end
      })
    }
    
    // Filter by type if provided
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

  // Get time series data (optionally filtered by date range)
  const getTimeSeriesData = (range?: DateRange | null): TimeSeriesData[] => {
    let filteredTransactions = transactions
    
    // Filter by date range if provided
    if (range) {
      filteredTransactions = transactions.filter(t => {
        const txDate = new Date(t.occurred_at)
        return txDate >= range.start && txDate <= range.end
      })
    }
    
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

  return {
    transactions,
    accounts,
    categories,
    budgets,
    loading,
    error,
    refresh: fetchAllData,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    addAccount,
    addCategory,
    addBudget,
    updateBudget,
    deleteBudget,
    getFinancialSummary,
    getFinancialSummaryThisMonth,
    getFinancialSummaryForDateRange,
    getCategoryBreakdown,
    getTimeSeriesData,
    getBudgetProgress,
  }
}

// Helper function to get date range based on period
export const getDateRangeForPeriod = (period: 'today' | 'week' | 'month' | 'year'): DateRange => {
  const now = new Date()
  
  switch (period) {
    case 'today':
      return {
        start: startOfDay(now),
        end: endOfDay(now),
      }
    case 'week':
      return {
        start: startOfWeek(now, { weekStartsOn: 1 }),
        end: endOfWeek(now, { weekStartsOn: 1 }),
      }
    case 'month':
      return {
        start: startOfMonth(now),
        end: endOfMonth(now),
      }
    case 'year':
      return {
        start: startOfYear(now),
        end: endOfYear(now),
      }
    default:
      return {
        start: startOfMonth(now),
        end: endOfMonth(now),
      }
  }
}

