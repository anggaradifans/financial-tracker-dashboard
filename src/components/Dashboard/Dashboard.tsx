import React, { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Download, LogOut, Menu, Moon, Plus, Sun, TrendingUp } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useFinancialData, getDateRangeForPeriod } from '../../hooks/useFinancialData'
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
import ConfirmDialog from '../ConfirmDialog'
import EmptyState from '../EmptyState'
import { CardSkeleton } from '../SkeletonLoader'
import DashboardNavigation, { getDashboardSection } from '../DashboardNavigation/DashboardNavigation'
import { exportToCSV, formatExportFilename } from '../../utils/exportUtils'
import { notifications } from '../../utils/notifications'
import { useTheme } from '../../contexts/ThemeContext'

const pageDetails = {
  overview: { title: 'Overview', description: 'Your cash flow and the latest activity in the selected period.' },
  transactions: { title: 'Transactions', description: 'Search, review, and export your financial activity.' },
  analytics: { title: 'Analytics', description: 'Understand income, spending, and category patterns.' },
  budgets: { title: 'Budgets', description: 'Set spending limits and monitor progress.' },
  settings: { title: 'Settings', description: 'Manage the accounts and categories used in your transactions.' },
}

const Dashboard: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const section = getDashboardSection(location.pathname, '/dashboard')
  const [period, setPeriod] = useState<PeriodFilterType>('month')
  const [dateRange, setDateRange] = useState<DateRange | null>(() => getDateRangeForPeriod('month'))
  const [showTransactionForm, setShowTransactionForm] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<any>(null)
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)
  const [showAmounts, setShowAmounts] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const data = useFinancialData(user?.id, dateRange)
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
    try {
      if (editingTransaction) { await updateTransaction(editingTransaction.id, transaction); notifications.success('Transaction updated successfully') }
      else { await addTransaction(transaction); notifications.success('Transaction added successfully') }
      closeTransactionForm()
    } catch (saveError) {
      notifications.error(saveError instanceof Error ? saveError.message : 'Failed to save transaction')
      throw saveError
    }
  }

  const handleDeleteTransaction = async (id: string) => {
    try { await deleteTransaction(id); notifications.success('Transaction deleted successfully') }
    catch (deleteError) { notifications.error(deleteError instanceof Error ? deleteError.message : 'Failed to delete transaction') }
  }

  const handleExport = () => {
    if (transactions.length === 0) { notifications.warning('No transactions to export'); return }
    try { exportToCSV(transactions, formatExportFilename('transactions', dateRange)); notifications.success(`Exported ${transactions.length} transactions`) }
    catch (exportError) { notifications.error(exportError instanceof Error ? exportError.message : 'Failed to export transactions') }
  }

  if (error) return <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 dark:bg-gray-900"><div className="text-center"><p className="mb-4 text-red-700 dark:text-red-400">{error}</p><button onClick={refresh} className="min-h-11 rounded-md bg-primary-600 px-4 text-white hover:bg-primary-700">Retry</button></div></div>

  return (
    <div className="dashboard-page min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-white">
      <DashboardNavigation basePath="/dashboard" isOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <ToastNotifications />
      <a href="#dashboard-content" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-white focus:px-4 focus:py-3 focus:text-gray-900">Skip to content</a>
      <div className="min-h-screen lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur dark:border-gray-700 dark:bg-gray-800/95"><div className="flex min-h-16 items-center justify-between gap-3 px-4 lg:px-8">
          <div className="flex min-w-0 items-center gap-3"><button type="button" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation" className="rounded-md p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 lg:hidden"><Menu className="h-5 w-5" aria-hidden="true" /></button><div className="min-w-0"><p className="text-base font-semibold text-gray-900 dark:text-white">{details.title}</p><p className="hidden truncate text-sm text-gray-500 dark:text-gray-400 sm:block">{user?.user_metadata?.first_name || user?.email}</p></div></div>
          <div className="flex items-center gap-1 sm:gap-2"><button onClick={openNewTransaction} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary-600 px-3 text-sm font-semibold text-white hover:bg-primary-700 sm:px-4"><Plus className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Add Transaction</span><span className="sm:hidden">Add</span></button><button onClick={toggleTheme} aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'} className="rounded-md p-3 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700">{theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}</button><button onClick={() => setShowSignOutConfirm(true)} aria-label="Sign Out" className="rounded-md p-3 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 sm:hidden"><LogOut className="h-5 w-5" aria-hidden="true" /></button><button onClick={() => setShowSignOutConfirm(true)} className="hidden min-h-11 items-center gap-2 rounded-md border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 sm:inline-flex"><LogOut className="h-4 w-4" aria-hidden="true" />Sign Out</button></div>
        </div></header>
        <main id="dashboard-content" tabIndex={-1} className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8"><div className="mb-6"><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{details.title}</h1><p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{details.description}</p></div>
          {loading ? <div className="grid grid-cols-1 gap-4 md:grid-cols-3" role="status" aria-label="Loading financial data"><CardSkeleton /><CardSkeleton /><CardSkeleton /></div> : <>
            {section === 'overview' && <div className="space-y-8"><PeriodFilter period={period} dateRange={dateRange} onPeriodChange={handlePeriodChange} onCustomRangeChange={setCustomRange} /><FinancialSummaryCards summary={summary} currency="IDR" showAmounts={showAmounts} onToggleAmounts={() => setShowAmounts(!showAmounts)} />{budgetProgress.length > 0 && <section aria-labelledby="budget-highlights"><h2 id="budget-highlights" className="mb-4 text-xl font-semibold">Budget highlights</h2><BudgetProgressCards budgetProgress={budgetProgress} currency="IDR" /></section>}<section aria-labelledby="recent-transactions" className="space-y-4"><div className="flex items-end justify-between gap-3"><div><h2 id="recent-transactions" className="text-xl font-semibold">Recent transactions</h2><p className="text-sm text-gray-600 dark:text-gray-400">The five latest entries in this period.</p></div><button onClick={() => navigate('/dashboard/transactions')} className="min-h-11 rounded-md px-3 text-sm font-medium text-primary-700 hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-900/30">View all</button></div><TransactionTable transactions={transactions.slice(0, 5)} accounts={accounts} categories={categories} onEdit={openEditTransaction} onDelete={handleDeleteTransaction} currency="IDR" onAddTransaction={openNewTransaction} emptyDescription="No transactions in this period. Add one to start tracking your finances." /></section></div>}
            {section === 'transactions' && <div className="space-y-6"><PeriodFilter period={period} dateRange={dateRange} onPeriodChange={handlePeriodChange} onCustomRangeChange={setCustomRange} /><section aria-labelledby="all-transactions" className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 id="all-transactions" className="text-xl font-semibold">All transactions</h2><button onClick={handleExport} disabled={transactions.length === 0} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"><Download className="h-4 w-4" aria-hidden="true" />Export CSV</button></div><TransactionTable transactions={transactions} accounts={accounts} categories={categories} onEdit={openEditTransaction} onDelete={handleDeleteTransaction} currency="IDR" onAddTransaction={openNewTransaction} emptyDescription="No transactions in this period. Choose another period or add a transaction." /></section></div>}
            {section === 'analytics' && <div className="space-y-8"><PeriodFilter period={period} dateRange={dateRange} onPeriodChange={handlePeriodChange} onCustomRangeChange={setCustomRange} />{timeSeriesData.length > 0 || categoryBreakdown.length > 0 ? <><FinancialCharts timeSeriesData={timeSeriesData} categoryBreakdown={categoryBreakdown} currency="IDR" />{transactions.length > 0 && <InsightsSection transactions={transactions} categoryBreakdown={categoryBreakdown} dateRange={dateRange} currency="IDR" />}</> : <EmptyState icon={TrendingUp} title="No analytics in this period" description="Choose another reporting period or add a transaction to see trends." action={{ label: 'Add Transaction', onClick: openNewTransaction }} />}</div>}
            {section === 'budgets' && <div className="space-y-8">{budgetProgress.length > 0 && <BudgetProgressCards budgetProgress={budgetProgress} currency="IDR" />}<section aria-labelledby="budget-management"><h2 id="budget-management" className="mb-4 text-xl font-semibold">Manage budgets</h2><BudgetManager budgets={budgets} categories={categories} onAddBudget={async (budget: Omit<Budget, 'id' | 'created_at' | 'category'>) => { await addBudget(budget) }} onUpdateBudget={async (id, updates) => { await updateBudget(id, updates) }} onDeleteBudget={async id => { await deleteBudget(id) }} currency="IDR" /></section></div>}
            {section === 'settings' && <section aria-labelledby="account-settings"><h2 id="account-settings" className="mb-4 text-xl font-semibold">Accounts and categories</h2><CategoryAccountManager accounts={accounts} categories={categories} onAddAccount={async (name, currency) => { await addAccount(name, currency) }} onDeleteAccount={deleteAccount} onAddCategory={async (name, allowedType) => { await addCategory(name, allowedType) }} onDeleteCategory={deleteCategory} canDeleteCategory={category => !!user && category.user_id === user.id} /></section>}
          </>}
        </main>
      </div>
      {showTransactionForm && <TransactionForm transaction={editingTransaction} accounts={accounts} categories={categories} onSave={handleSaveTransaction} onCancel={closeTransactionForm} currency="IDR" />}
      <ConfirmDialog isOpen={showSignOutConfirm} title="Sign Out" message="Are you sure you want to sign out?" confirmLabel="Sign Out" cancelLabel="Cancel" variant="warning" onConfirm={async () => { setShowSignOutConfirm(false); await signOut(); navigate('/') }} onCancel={() => setShowSignOutConfirm(false)} />
    </div>
  )
}

export default Dashboard
