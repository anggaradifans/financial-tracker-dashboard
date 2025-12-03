import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
// Option 1: Using Supabase library (original)
// import { useFinancialData, getDateRangeForPeriod } from '../hooks/useFinancialData'

// Option 2: Using direct REST API (no library dependency)
import { useFinancialDataRest as useFinancialData, getDateRangeForPeriod } from '../hooks/useFinancialDataRest'
import { PeriodFilter as PeriodFilterType, DateRange, Budget } from '../types/financial'

import FinancialSummaryCards from './FinancialSummaryCards'
import FinancialCharts from './FinancialCharts'
import TransactionTable from './TransactionTable'
import TransactionForm from './TransactionForm'
import CategoryAccountManager from './CategoryAccountManager'
import InsightsSection from './InsightsSection'
import PeriodFilter from './PeriodFilter'
import BudgetManager from './BudgetManager'
import BudgetProgressCards from './BudgetProgressCards'
import ToastNotifications from './ToastNotifications'
import { CardSkeleton, ChartSkeleton } from './SkeletonLoader'
import EmptyState from './EmptyState'
import { Plus, LogOut, Download, TrendingUp, Moon, Sun } from 'lucide-react'
import { exportToCSV, formatExportFilename } from '../utils/exportUtils'
import { notifications } from '../utils/notifications'
import { useTheme } from '../contexts/ThemeContext'

const Dashboard: React.FC = () => {
  const { user, signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [period, setPeriod] = useState<PeriodFilterType>('month')
  const [dateRange, setDateRange] = useState<DateRange | null>(() =>
    getDateRangeForPeriod('month')
  )
  const [showTransactionForm, setShowTransactionForm] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<any>(null)
  const [showManagePanel] = useState(false)
  const [showBudgetPanel, setShowBudgetPanel] = useState(false)
  const [showAmounts, setShowAmounts] = useState(false)

  const {
    transactions,
    accounts,
    categories,
    budgets,
    loading,
    error,
    refresh,
    addTransaction: addTx,
    updateTransaction: updateTx,
    deleteTransaction: deleteTx,
    addAccount,
    addCategory,
    addBudget,
    updateBudget,
    deleteBudget,
    getFinancialSummaryForDateRange,
    getCategoryBreakdown,
    getTimeSeriesData,
    getBudgetProgress,
  } = useFinancialData(user?.id, dateRange)

  const handlePeriodChange = (newPeriod: PeriodFilterType) => {
    setPeriod(newPeriod)
    if (newPeriod !== 'custom') {
      setDateRange(getDateRangeForPeriod(newPeriod))
    }
  }

  const handleCustomRangeChange = (start: Date, end: Date) => {
    setPeriod('custom')
    setDateRange({ start, end })
  }

  const handleAddTransaction = async (
    transaction: Omit<any, 'id' | 'created_at' | 'account' | 'category'>
  ) => {
    try {
      await addTx(transaction)
      setShowTransactionForm(false)
      setEditingTransaction(null)
      notifications.success('Transaction added successfully')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add transaction'
      notifications.error(message)
      throw error
    }
  }

  const handleUpdateTransaction = async (
    id: string,
    updates: Partial<any>
  ) => {
    try {
      await updateTx(id, updates)
      setShowTransactionForm(false)
      setEditingTransaction(null)
      notifications.success('Transaction updated successfully')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update transaction'
      notifications.error(message)
      throw error
    }
  }

  const handleEditTransaction = (transaction: any) => {
    setEditingTransaction(transaction)
    setShowTransactionForm(true)
  }

  const handleSaveTransaction = async (
    transaction: Omit<any, 'id' | 'created_at' | 'account' | 'category'>
  ) => {
    if (editingTransaction) {
      await handleUpdateTransaction(editingTransaction.id, transaction)
    } else {
      await handleAddTransaction(transaction)
    }
  }

  const handleDeleteTransaction = async (id: string) => {
    try {
      await deleteTx(id)
      notifications.success('Transaction deleted successfully')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete transaction'
      notifications.error(message)
    }
  }

  const handleSignOut = async () => {
    await signOut()
  }

  const handleExport = () => {
    try {
      if (transactions.length === 0) {
        notifications.warning('No transactions to export')
        return
      }
      const filename = formatExportFilename('transactions', dateRange)
      exportToCSV(transactions, filename)
      notifications.success(`Exported ${transactions.length} transactions`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to export transactions'
      notifications.error(message)
    }
  }

  // Use summary, charts, and insights based on selected date range
  const summary = getFinancialSummaryForDateRange(dateRange)
  const categoryBreakdown = getCategoryBreakdown(undefined, dateRange)
  const timeSeriesData = getTimeSeriesData(dateRange)
  const budgetProgress = getBudgetProgress(dateRange)

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center transition-colors">
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400 mb-4 transition-colors">Error: {error}</p>
          <button
            onClick={refresh}
            className="px-4 py-2 bg-primary-600 dark:bg-primary-500 text-white rounded-md hover:bg-primary-700 dark:hover:bg-primary-600 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
      <ToastNotifications />
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700 sticky top-0 z-40 transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 py-3 sm:py-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white transition-colors truncate">
                Financial Tracker
              </h1>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 transition-colors truncate">
                Welcome back, {user?.user_metadata?.first_name || user?.email}!
              </p>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
                title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              >
                {theme === 'light' ? <Moon className="h-4 w-4 sm:h-5 sm:w-5" /> : <Sun className="h-4 w-4 sm:h-5 sm:w-5" />}
              </button>
              <button
                onClick={handleExport}
                className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 bg-green-600 dark:bg-green-700 text-white rounded-md hover:bg-green-700 dark:hover:bg-green-600 transition-colors text-sm sm:text-base flex-shrink-0"
                title="Export transactions to CSV"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Export CSV</span>
                <span className="sm:hidden">Export</span>
              </button>
              <button
                onClick={() => {
                  setEditingTransaction(null)
                  setShowTransactionForm(true)
                }}
                className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 bg-primary-600 dark:bg-primary-500 text-white rounded-md hover:bg-primary-700 dark:hover:bg-primary-600 transition-colors text-sm sm:text-base flex-shrink-0"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Add Transaction</span>
                <span className="sm:hidden">Add</span>
              </button>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 bg-red-600 dark:bg-red-700 text-white rounded-md hover:bg-red-700 dark:hover:bg-red-600 transition-colors text-sm sm:text-base flex-shrink-0"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6 lg:py-8 space-y-4 sm:space-y-6 lg:space-y-8 animate-fadeIn">
        {/* Period Filter */}
        <PeriodFilter
          period={period}
          dateRange={dateRange}
          onPeriodChange={handlePeriodChange}
          onCustomRangeChange={handleCustomRangeChange}
        />

        {/* Financial Summary Cards */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : (
          <>
            <FinancialSummaryCards 
              summary={summary} 
              currency="IDR" 
              showAmounts={showAmounts}
              onToggleAmounts={() => setShowAmounts(!showAmounts)}
            />

            {/* Budget Progress Cards */}
            {(budgetProgress.length > 0 || budgets.length > 0) && (
              <BudgetProgressCards 
                budgetProgress={budgetProgress} 
                currency="IDR"
                onShowBudgets={() => setShowBudgetPanel(!showBudgetPanel)}
                showBudgets={showBudgetPanel}
              />
            )}

            {/* Budget Management */}
            {showBudgetPanel && (
              <BudgetManager
                budgets={budgets}
                categories={categories}
                onAddBudget={async (budget: Omit<Budget, 'id' | 'created_at' | 'category'>) => {
                  await addBudget(budget)
                }}
                onUpdateBudget={async (id: string, updates: Partial<Budget>) => {
                  await updateBudget(id, updates)
                }}
                onDeleteBudget={async (id: string) => {
                  await deleteBudget(id)
                }}
                currency="IDR"
              />
            )}

            {/* Charts Section */}
            {loading ? (
              <ChartSkeleton />
            ) : timeSeriesData.length > 0 || categoryBreakdown.length > 0 ? (
              <FinancialCharts
                timeSeriesData={timeSeriesData}
                categoryBreakdown={categoryBreakdown}
                currency="IDR"
              />
            ) : transactions.length === 0 ? (
              <EmptyState
                icon={TrendingUp}
                title="No financial data yet"
                description="Start by adding your first transaction to see charts and insights"
                action={{
                  label: 'Add Transaction',
                  onClick: () => {
                    setEditingTransaction(null)
                    setShowTransactionForm(true)
                  },
                }}
              />
            ) : null}

            {/* Category & Account Management */}
            {showManagePanel && (
              <CategoryAccountManager
                accounts={accounts}
                categories={categories}
                onAddAccount={async (name, currency) => {
                  await addAccount(name, currency)
                }}
                onAddCategory={async (name, allowedType) => {
                  await addCategory(name, allowedType)
                }}
              />
            )}

            {/* Insights Section */}
            {transactions.length > 0 && (
              <InsightsSection
                transactions={transactions}
                categoryBreakdown={categoryBreakdown}
                dateRange={dateRange}
                currency="IDR"
              />
            )}

            {/* Transactions Table */}
            <TransactionTable
              transactions={transactions}
              onEdit={handleEditTransaction}
              onDelete={handleDeleteTransaction}
              loading={loading}
              currency="IDR"
              onAddTransaction={() => {
                setEditingTransaction(null)
                setShowTransactionForm(true)
              }}
            />
          </>
        )}
      </main>

      {/* Transaction Form Modal */}
      {showTransactionForm && (
        <TransactionForm
          transaction={editingTransaction}
          accounts={accounts}
          categories={categories}
          onSave={handleSaveTransaction}
          onCancel={() => {
            setShowTransactionForm(false)
            setEditingTransaction(null)
          }}
          currency="IDR"
        />
      )}
    </div>
  )
}

export default Dashboard