import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useFinancialData, getDateRangeForPeriod } from '../../hooks/useFinancialData'
import { PeriodFilter as PeriodFilterType, DateRange, Budget } from '../../types/financial'

import FinancialSummaryCards from '../FinancialSummaryCards'
import FinancialCharts from '../FinancialCharts'
import TransactionTable from '../TransactionTable'
import TransactionForm from '../TransactionForm'
import CategoryAccountManager from '../CategoryAccountManager'
import InsightsSection from '../InsightsSection'
import PeriodFilter from '../PeriodFilter'
import BudgetManager from '../BudgetManager'
import BudgetProgressCards from '../BudgetProgressCards'
import ToastNotifications from '../ToastNotifications'
import ConfirmDialog from '../ConfirmDialog'
import { CardSkeleton } from '../SkeletonLoader'
import { Plus, LogOut, Download, Moon, Sun, Settings, Wallet } from 'lucide-react'
import { exportToCSV, formatExportFilename } from '../../utils/exportUtils'
import { notifications } from '../../utils/notifications'
import { useTheme } from '../../contexts/ThemeContext'

const Dashboard: React.FC = () => {
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [period, setPeriod] = useState<PeriodFilterType>('month')
  const [dateRange, setDateRange] = useState<DateRange | null>(() =>
    getDateRangeForPeriod('month')
  )
  const [showTransactionForm, setShowTransactionForm] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<any>(null)
  const [showManagePanel, setShowManagePanel] = useState(false)
  const [showBudgetPanel, setShowBudgetPanel] = useState(false)
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)
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
    deleteAccount,
    addCategory,
    deleteCategory,
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
    setShowSignOutConfirm(false)
    await signOut()
    navigate('/')
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
    <div className="dashboard-page min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
      <ToastNotifications />
      <a href="#dashboard-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:px-4 focus:py-3 focus:text-gray-900">Skip to dashboard</a>
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8">
          <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3 py-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white transition-colors">
                Financial Tracker
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 transition-colors break-words">
                {user ? `Welcome back, ${user.user_metadata?.first_name || user.email}!` : 'Welcome back'}
              </p>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
                aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              >
                {theme === 'light' ? <Moon className="h-4 w-4 sm:h-5 sm:w-5" /> : <Sun className="h-4 w-4 sm:h-5 sm:w-5" />}
              </button>
              <button
                onClick={() => setShowManagePanel(!showManagePanel)}
                className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-md transition-colors text-sm sm:text-base flex-shrink-0 ${
                  showManagePanel
                    ? 'bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-white'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                aria-label="Manage categories and accounts"
                aria-expanded={showManagePanel}
                aria-controls="account-management"
              >
                <Settings className="h-4 w-4" />
                <span>Manage</span>
              </button>
              <button
                onClick={() => setShowBudgetPanel(!showBudgetPanel)}
                disabled={loading}
                className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-expanded={showBudgetPanel}
                aria-controls="budget-management"
              >
                <Wallet className="h-4 w-4" />
                <span>Budgets</span>
              </button>
              <button
                onClick={() => setShowSignOutConfirm(true)}
                aria-label="Sign Out"
                className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm sm:text-base flex-shrink-0"
              >
                <LogOut className="h-4 w-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="dashboard-content" tabIndex={-1} className="max-w-7xl mx-auto px-4 lg:px-8 py-6 lg:py-8 space-y-6 lg:space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-gray-900 dark:text-white">Your finances</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Review your cash flow and keep your transactions up to date.</p>
          </div>
          <button
            onClick={() => { setEditingTransaction(null); setShowTransactionForm(true) }}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-primary-600 text-white rounded-md hover:bg-primary-700 text-sm font-semibold shrink-0"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add Transaction
          </button>
        </div>
        {/* Period Filter */}
        <PeriodFilter
          period={period}
          dateRange={dateRange}
          onPeriodChange={handlePeriodChange}
          onCustomRangeChange={handleCustomRangeChange}
        />

        {/* Category & Account Management */}
        {showManagePanel && (
          <section id="account-management" aria-label="Categories and accounts">
          <CategoryAccountManager
            accounts={accounts}
            categories={categories}
            onAddAccount={async (name, currency) => { await addAccount(name, currency) }}
            onDeleteAccount={async (id) => { await deleteAccount(id) }}
            onAddCategory={async (name, allowedType) => { await addCategory(name, allowedType) }}
            onDeleteCategory={async (id) => { await deleteCategory(id) }}
            canDeleteCategory={(category) => !!user && category.user_id === user.id}
          />
          </section>
        )}

        {showBudgetPanel && !loading && (
          <section id="budget-management" aria-label="Budget management">
            <BudgetManager
              budgets={budgets}
              categories={categories}
              onAddBudget={async (budget: Omit<Budget, 'id' | 'created_at' | 'category'>) => { await addBudget(budget) }}
              onUpdateBudget={async (id: string, updates: Partial<Budget>) => { await updateBudget(id, updates) }}
              onDeleteBudget={async (id: string) => { await deleteBudget(id) }}
              currency="IDR"
            />
          </section>
        )}

        {/* Financial Summary Cards */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4" role="status" aria-label="Loading financial data">
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

            <section aria-labelledby="transactions-heading" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 id="transactions-heading" className="text-xl font-semibold text-gray-900 dark:text-white">Transactions</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Activity in your selected period</p>
                </div>
                <button onClick={handleExport} disabled={transactions.length === 0} aria-label="Export transactions to CSV" className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed">
                  <Download className="h-4 w-4" aria-hidden="true" />Export CSV
                </button>
              </div>
              <TransactionTable
                transactions={transactions}
                accounts={accounts}
                categories={categories}
                onEdit={handleEditTransaction}
                onDelete={handleDeleteTransaction}
                loading={loading}
                currency="IDR"
                onAddTransaction={() => { setEditingTransaction(null); setShowTransactionForm(true) }}
                emptyDescription="No transactions in this period. Choose another period or add a transaction."
              />
            </section>

            {/* Budget Progress Cards */}
            {(budgetProgress.length > 0 || budgets.length > 0) && (
              <BudgetProgressCards 
                budgetProgress={budgetProgress} 
                currency="IDR"
                onShowBudgets={() => setShowBudgetPanel(!showBudgetPanel)}
                showBudgets={showBudgetPanel}
              />
            )}

            {/* Charts Section */}
            {(timeSeriesData.length > 0 || categoryBreakdown.length > 0) && (
              <section aria-labelledby="trends-heading" className="space-y-4">
                <h2 id="trends-heading" className="text-xl font-semibold text-gray-900 dark:text-white">Trends & breakdowns</h2>
              <FinancialCharts
                timeSeriesData={timeSeriesData}
                categoryBreakdown={categoryBreakdown}
                currency="IDR"
              />
              </section>
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

      {/* Sign Out Confirmation */}
      <ConfirmDialog
        isOpen={showSignOutConfirm}
        title="Sign Out"
        message="Are you sure you want to sign out?"
        confirmLabel="Sign Out"
        cancelLabel="Cancel"
        variant="warning"
        onConfirm={handleSignOut}
        onCancel={() => setShowSignOutConfirm(false)}
      />
    </div>
  )
}

export default Dashboard
