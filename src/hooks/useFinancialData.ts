import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import {
  Transaction,
  Account,
  Category,
  FinancialSummary,
  CategoryBreakdown,
  TimeSeriesData,
  DateRange,
  TransactionType,
} from '../types/financial'
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns'

export const useFinancialData = (userId: string | undefined, dateRange: DateRange | null) => {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    console.log('[useFinancialData] useEffect triggered', { userId, dateRange })
    if (userId) {
      console.log('[useFinancialData] userId present, fetching data...')
      fetchAllData()
    } else {
      console.warn('[useFinancialData] No userId provided, skipping data fetch')
      setLoading(false)
    }
  }, [userId, dateRange])

  const fetchAllData = async () => {
    console.log('[useFinancialData] fetchAllData called')
    try {
      setLoading(true)
      setError(null)
      console.log('[useFinancialData] Starting to fetch all data...')

      await Promise.all([
        fetchTransactions(),
        fetchAccounts(),
        fetchCategories(),
      ])
      
      console.log('[useFinancialData] All data fetched successfully')
    } catch (err) {
      console.error('[useFinancialData] ERROR in fetchAllData:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch data'
      console.error('[useFinancialData] Error message:', errorMessage)
      setError(errorMessage)
    } finally {
      setLoading(false)
      console.log('[useFinancialData] Loading set to false')
    }
  }

  const fetchTransactions = async () => {
    console.log('[useFinancialData] fetchTransactions called', { userId, dateRange })
    try {
      let query = supabase
        .from('transactions')
        .select(`
          *,
          account:accounts(*),
          category:categories(*)
        `)
        .eq('user_id', userId!)
        .is('deleted_at', null)

      if (dateRange) {
        console.log('[useFinancialData] Applying date range filter:', {
          start: dateRange.start.toISOString(),
          end: dateRange.end.toISOString(),
        })
        query = query
          .gte('occurred_at', dateRange.start.toISOString())
          .lte('occurred_at', dateRange.end.toISOString())
      }

      console.log('[useFinancialData] Executing transactions query...')
      const { data, error } = await query
        .order('occurred_at', { ascending: false })

      if (error) {
        console.error('[useFinancialData] ERROR fetching transactions:', error)
        throw error
      }
      
      console.log('[useFinancialData] Transactions fetched successfully:', data?.length || 0, 'records')
      setTransactions((data as Transaction[]) || [])
    } catch (err) {
      console.error('[useFinancialData] Exception in fetchTransactions:', err)
      throw err
    }
  }

  const fetchAccounts = async () => {
    console.log('[useFinancialData] fetchAccounts called')
    try {
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .order('name', { ascending: true })

      if (error) {
        console.error('[useFinancialData] ERROR fetching accounts:', error)
        throw error
      }
      
      console.log('[useFinancialData] Accounts fetched successfully:', data?.length || 0, 'records')
      setAccounts((data as Account[]) || [])
    } catch (err) {
      console.error('[useFinancialData] Exception in fetchAccounts:', err)
      throw err
    }
  }

  const fetchCategories = async () => {
    console.log('[useFinancialData] fetchCategories called')
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name', { ascending: true })

      if (error) {
        console.error('[useFinancialData] ERROR fetching categories:', error)
        throw error
      }
      
      console.log('[useFinancialData] Categories fetched successfully:', data?.length || 0, 'records')
      setCategories((data as Category[]) || [])
    } catch (err) {
      console.error('[useFinancialData] Exception in fetchCategories:', err)
      throw err
    }
  }

  const addTransaction = async (transaction: Omit<Transaction, 'id' | 'created_at' | 'account' | 'category'>) => {
    const { data, error } = await supabase
      .from('transactions')
      .insert({
        ...transaction,
        user_id: userId,
      })
      .select(`
        *,
        account:accounts(*),
        category:categories(*)
      `)
      .single()

    if (error) throw error
    if (data) {
      setTransactions(prev => [data as Transaction, ...prev])
    }
    return data as Transaction
  }

  const updateTransaction = async (id: string, updates: Partial<Transaction>) => {
    const { data, error } = await supabase
      .from('transactions')
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        account:accounts(*),
        category:categories(*)
      `)
      .single()

    if (error) throw error
    if (data) {
      setTransactions(prev =>
        prev.map(t => t.id === id ? (data as Transaction) : t)
      )
    }
    return data as Transaction
  }

  const deleteTransaction = async (id: string) => {
    const { error } = await supabase
      .from('transactions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
    setTransactions(prev => prev.filter(t => t.id !== id))
  }

  const addAccount = async (name: string, currency: string = 'IDR') => {
    const { data, error } = await supabase
      .from('accounts')
      .insert({ name, currency })
      .select()
      .single()

    if (error) throw error
    if (data) {
      setAccounts(prev => [...prev, data as Account])
    }
    return data as Account
  }

  const addCategory = async (name: string, allowed_type: 'income' | 'expense' | 'both' = 'both') => {
    const { data, error } = await supabase
      .from('categories')
      .insert({ name, allowed_type })
      .select()
      .single()

    if (error) throw error
    if (data) {
      setCategories(prev => [...prev, data as Category])
    }
    return data as Category
  }

  // Calculate financial summary
  const getFinancialSummary = (): FinancialSummary => {
    const income = transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + Number(t.amount), 0)

    const outcome = transactions
      .filter(t => t.type === 'outcome')
      .reduce((sum, t) => sum + Number(t.amount), 0)

    const netBalance = income - outcome

    // Calculate account balance (sum of all income minus expenses)
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

  // Get category breakdown
  const getCategoryBreakdown = (type?: TransactionType): CategoryBreakdown[] => {
    let filtered = transactions
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
  const getTimeSeriesData = (): TimeSeriesData[] => {
    const grouped = transactions.reduce((acc, t) => {
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
    loading,
    error,
    refresh: fetchAllData,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    addAccount,
    addCategory,
    getFinancialSummary,
    getCategoryBreakdown,
    getTimeSeriesData,
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
