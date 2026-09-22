import React, { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Download, Menu, Moon, Plus, Sun, TrendingUp } from 'lucide-react'
import { useDemoFinancialData } from '../../hooks/useDemoFinancialData'
import { getDateRangeForPeriod } from '../../hooks/useFinancialData'
import { Budget, DateRange, PeriodFilter as PeriodFilterType } from '../../types/financial'
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
import EmptyState from '../EmptyState'
import { CardSkeleton } from '../SkeletonLoader'
import DashboardNavigation, { getDashboardSection } from '../DashboardNavigation/DashboardNavigation'
import DemoBanner from '../DemoBanner'
import { exportToCSV, formatExportFilename } from '../../utils/exportUtils'
import { notifications } from '../../utils/notifications'
import { useTheme } from '../../contexts/ThemeContext'

const pageDetails = {
  overview: { title: 'Overview', description: 'Sample cash flow and the latest demo activity.' },
  transactions: { title: 'Transactions', description: 'Explore and filter the sample financial activity.' },
  analytics: { title: 'Analytics', description: 'Explore trends and patterns using sample data.' },
  budgets: { title: 'Budgets', description: 'Explore sample spending limits and progress.' },
  settings: { title: 'Settings', description: 'Explore sample accounts and transaction categories.' },
}

const DemoDashboard: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { theme, toggleTheme } = useTheme()
  const section = getDashboardSection(location.pathname, '/demo')
  const [period, setPeriod] = useState<PeriodFilterType>('month')
  const [dateRange, setDateRange] = useState<DateRange | null>(() => getDateRangeForPeriod('month'))
  const [showTransactionForm, setShowTransactionForm] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<any>(null)
  const [showAmounts, setShowAmounts] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const data = useDemoFinancialData(dateRange)
  const { transactions, accounts, categories, budgets, loading, error, refresh, addTransaction, updateTransaction, deleteTransaction, addAccount, deleteAccount, addCategory, deleteCategory, addBudget, updateBudget, deleteBudget } = data
  const summary = data.getFinancialSummaryForDateRange(dateRange)
  const categoryBreakdown = data.getCategoryBreakdown(undefined, dateRange)
  const timeSeriesData = data.getTimeSeriesData(dateRange)
  const budgetProgress = data.getBudgetProgress(dateRange)
  const details = pageDetails[section]

  const setCustomRange = (start: Date, end: Date) => { setPeriod('custom'); setDateRange({ start, end }) }
  const handlePeriodChange = (next: PeriodFilterType) => { setPeriod(next); if (next !== 'custom') setDateRange(getDateRangeForPeriod(next)) }
  const openNewTransaction = () => { setEditingTransaction(null); setShowTransactionForm(true) }
  const closeTransactionForm = () => { setShowTransactionForm(false); setEditingTransaction(null) }
  const openEditTransaction = (transaction: any) => { setEditingTransaction(transaction); setShowTransactionForm(true) }

  const handleSaveTransaction = async (transaction: Omit<any, 'id' | 'created_at' | 'account' | 'category'>) => {
    if (editingTransaction) await updateTransaction(editingTransaction.id, transaction)
    else await addTransaction(transaction)
    closeTransactionForm()
    notifications.info(`Demo mode: Transaction would be ${editingTransaction ? 'updated' : 'saved'} in real mode`)
  }

  const handleDeleteTransaction = async (id: string) => { await deleteTransaction(id); notifications.info('Demo mode: Transaction would be deleted in real mode') }
  const handleExport = () => {
    if (transactions.length === 0) { notifications.warning('No transactions to export'); return }
    exportToCSV(transactions, formatExportFilename('demo-transactions', dateRange))
    notifications.success(`Exported ${transactions.length} demo transactions`)
  }

  if (error) return <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 dark:bg-gray-900"><div className="text-center"><p className="mb-4 text-red-700 dark:text-red-400">{error}</p><button onClick={refresh} className="min-h-11 rounded-md bg-primary-600 px-4 text-white hover:bg-primary-700">Retry</button></div></div>

  return (
    <div className="dashboard-page min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-white">
      <DashboardNavigation basePath="/demo" isOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <ToastNotifications />
      <div className="lg:pl-64"><DemoBanner /></div>
      <a href="#demo-dashboard-content" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-white focus:px-4 focus:py-3 focus:text-gray-900">Skip to content</a>
      <div className="min-h-screen lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur dark:border-gray-700 dark:bg-gray-800/95"><div className="flex min-h-16 items-center justify-between gap-3 px-4 lg:px-8">
          <div className="flex min-w-0 items-center gap-3"><button type="button" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation" className="rounded-md p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 lg:hidden"><Menu className="h-5 w-5" aria-hidden="true" /></button><div><p className="text-base font-semibold text-gray-900 dark:text-white">{details.title}</p><p className="hidden text-sm text-gray-500 dark:text-gray-400 sm:block">Sample data</p></div></div>
          <div className="flex items-center gap-1 sm:gap-2"><button onClick={openNewTransaction} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary-600 px-3 text-sm font-semibold text-white hover:bg-primary-700 sm:px-4"><Plus className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Add Transaction</span><span className="sm:hidden">Add</span></button><button onClick={toggleTheme} aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'} className="rounded-md p-3 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700">{theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}</button><button onClick={() => navigate('/')} className="hidden min-h-11 items-center justify-center rounded-md border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 sm:inline-flex">Sign In</button></div>
        </div></header>
        <main id="demo-dashboard-content" tabIndex={-1} className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8"><div className="mb-6"><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{details.title}</h1><p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{details.description}</p></div>
          {loading ? <div className="grid grid-cols-1 gap-4 md:grid-cols-3" role="status" aria-label="Loading demo financial data"><CardSkeleton /><CardSkeleton /><CardSkeleton /></div> : <>
            {section === 'overview' && <div className="space-y-8"><PeriodFilter period={period} dateRange={dateRange} onPeriodChange={handlePeriodChange} onCustomRangeChange={setCustomRange} /><FinancialSummaryCards summary={summary} currency="IDR" showAmounts={showAmounts} onToggleAmounts={() => setShowAmounts(!showAmounts)} />{budgetProgress.length > 0 && <section aria-labelledby="demo-budget-highlights"><h2 id="demo-budget-highlights" className="mb-4 text-xl font-semibold">Budget highlights</h2><BudgetProgressCards budgetProgress={budgetProgress} currency="IDR" /></section>}<section aria-labelledby="demo-recent-transactions" className="space-y-4"><div className="flex items-end justify-between gap-3"><div><h2 id="demo-recent-transactions" className="text-xl font-semibold">Recent transactions</h2><p className="text-sm text-gray-600 dark:text-gray-400">The five latest sample entries.</p></div><button onClick={() => navigate('/demo/transactions')} className="min-h-11 rounded-md px-3 text-sm font-medium text-primary-700 hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-900/30">View all</button></div><TransactionTable transactions={transactions.slice(0, 5)} accounts={accounts} categories={categories} onEdit={openEditTransaction} onDelete={handleDeleteTransaction} currency="IDR" onAddTransaction={openNewTransaction} emptyDescription="No sample transactions in this period. Choose another period to see demo activity." /></section></div>}
            {section === 'transactions' && <div className="space-y-6"><PeriodFilter period={period} dateRange={dateRange} onPeriodChange={handlePeriodChange} onCustomRangeChange={setCustomRange} /><section aria-labelledby="all-demo-transactions" className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 id="all-demo-transactions" className="text-xl font-semibold">All sample transactions</h2><button onClick={handleExport} disabled={transactions.length === 0} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"><Download className="h-4 w-4" aria-hidden="true" />Export CSV</button></div><TransactionTable transactions={transactions} accounts={accounts} categories={categories} onEdit={openEditTransaction} onDelete={handleDeleteTransaction} currency="IDR" onAddTransaction={openNewTransaction} emptyDescription="No sample transactions in this period. Choose another period to see demo activity." /></section></div>}
            {section === 'analytics' && <div className="space-y-8"><PeriodFilter period={period} dateRange={dateRange} onPeriodChange={handlePeriodChange} onCustomRangeChange={setCustomRange} />{timeSeriesData.length > 0 || categoryBreakdown.length > 0 ? <><FinancialCharts timeSeriesData={timeSeriesData} categoryBreakdown={categoryBreakdown} currency="IDR" />{transactions.length > 0 && <InsightsSection transactions={transactions} categoryBreakdown={categoryBreakdown} dateRange={dateRange} currency="IDR" />}</> : <EmptyState icon={TrendingUp} title="No demo analytics in this period" description="Choose another period to explore the sample trends." />}</div>}
            {section === 'budgets' && <div className="space-y-8">{budgetProgress.length > 0 && <BudgetProgressCards budgetProgress={budgetProgress} currency="IDR" />}<section aria-labelledby="demo-budget-management"><h2 id="demo-budget-management" className="mb-4 text-xl font-semibold">Manage demo budgets</h2><BudgetManager budgets={budgets} categories={categories} onAddBudget={async (budget: Omit<Budget, 'id' | 'created_at' | 'category'>) => { await addBudget(budget); notifications.info('Demo mode: Budget would be saved in real mode') }} onUpdateBudget={async (id, updates) => { await updateBudget(id, updates); notifications.info('Demo mode: Budget would be updated in real mode') }} onDeleteBudget={async id => { await deleteBudget(id); notifications.info('Demo mode: Budget would be deleted in real mode') }} currency="IDR" /></section></div>}
            {section === 'settings' && <section aria-labelledby="demo-account-settings"><h2 id="demo-account-settings" className="mb-4 text-xl font-semibold">Sample accounts and categories</h2><CategoryAccountManager accounts={accounts} categories={categories} onAddAccount={async (name, currency) => { await addAccount(name, currency); notifications.info('Demo mode: Account would be saved in real mode') }} onDeleteAccount={async id => { await deleteAccount(id); notifications.info('Demo mode: Account would be deleted in real mode') }} onAddCategory={async (name, allowedType) => { await addCategory(name, allowedType); notifications.info('Demo mode: Category would be saved in real mode') }} onDeleteCategory={async id => { await deleteCategory(id); notifications.info('Demo mode: Category would be deleted in real mode') }} /></section>}
          </>}
        </main>
      </div>
      {showTransactionForm && <TransactionForm transaction={editingTransaction} accounts={accounts} categories={categories} onSave={handleSaveTransaction} onCancel={closeTransactionForm} currency="IDR" />}
    </div>
  )
}

export default DemoDashboard
