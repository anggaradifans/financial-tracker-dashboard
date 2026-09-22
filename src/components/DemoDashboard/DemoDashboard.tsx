import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDemoFinancialData } from '../../hooks/useDemoFinancialData'
import { getDateRangeForPeriod } from '../../hooks/useFinancialData'
import { PeriodFilter as PeriodFilterType, DateRange, Budget } from '../../types/financial'

import FinancialSummaryCards from '../FinancialSummaryCards'
import FinancialCharts from '../FinancialCharts'
import TransactionTable from '../TransactionTable'
import TransactionForm from '../TransactionForm'
import InsightsSection from '../InsightsSection'
import PeriodFilter from '../PeriodFilter'
import BudgetManager from '../BudgetManager'
import BudgetProgressCards from '../BudgetProgressCards'
import ToastNotifications from '../ToastNotifications'
import DemoBanner from '../DemoBanner'
import { CardSkeleton } from '../SkeletonLoader'
import { Plus, Download, Moon, Sun, Wallet } from 'lucide-react'
import { exportToCSV, formatExportFilename } from '../../utils/exportUtils'
import { notifications } from '../../utils/notifications'
import { useTheme } from '../../contexts/ThemeContext'

const DemoDashboard: React.FC = () => {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const [period, setPeriod] = useState<PeriodFilterType>('month')
  const [dateRange, setDateRange] = useState<DateRange | null>(() =>
    getDateRangeForPeriod('month')
  )
  const [showTransactionForm, setShowTransactionForm] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<any>(null)
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
    addBudget,
    updateBudget,
    deleteBudget,
    getFinancialSummaryForDateRange,
    getCategoryBreakdown,
    getTimeSeriesData,
    getBudgetProgress,
  } = useDemoFinancialData(dateRange)

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
      notifications.info('Demo mode: Transaction would be saved in real mode')
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
      notifications.info('Demo mode: Transaction would be updated in real mode')
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
      notifications.info('Demo mode: Transaction would be deleted in real mode')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete transaction'
      notifications.error(message)
    }
  }

  const handleExport = () => {
    try {
      if (transactions.length === 0) {
        notifications.warning('No transactions to export')
        return
      }
      const filename = formatExportFilename('demo-transactions', dateRange)
      exportToCSV(transactions, filename)
      notifications.success(`Exported ${transactions.length} demo transactions`)
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
      <DemoBanner />
      <ToastNotifications />
      <a href="#demo-dashboard-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:px-4 focus:py-3 focus:text-gray-900">Skip to dashboard</a>
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-4 lg:px-8">
          <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3 py-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white transition-colors">
                Financial Tracker <span className="text-yellow-600 dark:text-yellow-400 text-sm">(Demo)</span>
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 transition-colors">
                Explore sample data without changing your account.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              >
                {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
              </button>
              <button
                onClick={() => setShowBudgetPanel(!showBudgetPanel)}
                disabled={loading}
                aria-expanded={showBudgetPanel}
                aria-controls="demo-budget-management"
                className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                <Wallet className="h-4 w-4" aria-hidden="true" /> Budgets
              </button>
              <button
                onClick={() => navigate('/')}
                className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm"
              >
                Sign In
              </button>
            </div>
          </div>
        </div>
      </header>

      <main id="demo-dashboard-content" tabIndex={-1} className="max-w-7xl mx-auto px-4 lg:px-8 py-6 lg:py-8 space-y-6 lg:space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-gray-900 dark:text-white">Explore the demo</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Review the sample financial activity, then sign in to track your own.</p>
          </div>
          <button onClick={() => { setEditingTransaction(null); setShowTransactionForm(true) }} className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-primary-600 text-white rounded-md hover:bg-primary-700 text-sm font-semibold shrink-0">
            <Plus className="h-4 w-4" aria-hidden="true" /> Add Transaction
          </button>
        </div>

        <PeriodFilter
          period={period}
          dateRange={dateRange}
          onPeriodChange={handlePeriodChange}
          onCustomRangeChange={handleCustomRangeChange}
        />

        {showBudgetPanel && !loading && (
          <section id="demo-budget-management" aria-label="Budget management">
            <BudgetManager
              budgets={budgets}
              categories={categories}
              onAddBudget={async (budget: Omit<Budget, 'id' | 'created_at' | 'category'>) => { await addBudget(budget); notifications.info('Demo mode: Budget would be saved in real mode') }}
              onUpdateBudget={async (id: string, updates: Partial<Budget>) => { await updateBudget(id, updates); notifications.info('Demo mode: Budget would be updated in real mode') }}
              onDeleteBudget={async (id: string) => { await deleteBudget(id); notifications.info('Demo mode: Budget would be deleted in real mode') }}
              currency="IDR"
            />
          </section>
        )}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4" role="status" aria-label="Loading demo financial data">
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

            <section aria-labelledby="demo-transactions-heading" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 id="demo-transactions-heading" className="text-xl font-semibold text-gray-900 dark:text-white">Transactions</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Sample activity in your selected period</p>
                </div>
                <button onClick={handleExport} disabled={transactions.length === 0} aria-label="Export demo transactions to CSV" className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed">
                  <Download className="h-4 w-4" aria-hidden="true" /> Export CSV
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
                emptyDescription="No sample transactions in this period. Choose another period to see demo activity."
              />
            </section>

            {(budgetProgress.length > 0 || budgets.length > 0) && (
              <BudgetProgressCards 
                budgetProgress={budgetProgress} 
                currency="IDR"
                onShowBudgets={() => setShowBudgetPanel(!showBudgetPanel)}
                showBudgets={showBudgetPanel}
              />
            )}

            {(timeSeriesData.length > 0 || categoryBreakdown.length > 0) && (
              <section aria-labelledby="demo-trends-heading" className="space-y-4">
                <h2 id="demo-trends-heading" className="text-xl font-semibold text-gray-900 dark:text-white">Trends & breakdowns</h2>
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
    </div>
  )
}

export default DemoDashboard
