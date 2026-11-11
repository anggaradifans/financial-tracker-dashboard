import React, { useRef, useState } from 'react'
import { useSpendingDrafts } from '../../hooks/useSpendingDrafts'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeftRight, Download, LogOut, Menu, Moon, Plus, Sun, Upload } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useFinancialData, getDateRangeForPeriod } from '../../hooks/useFinancialData'
import { Budget, DateRange, PeriodFilter as PeriodFilterType } from '../../types/financial'
import AnalyticsNavigation, { getAnalyticsView } from '../AnalyticsNavigation/AnalyticsNavigation'
import FinancialSummaryCards from '../FinancialSummaryCards'
import ConnectedSavingsAnalysis from '../SavingsAnalysis/SavingsAnalysis'
import TransactionTable from '../TransactionTable'
import TransactionForm from '../TransactionForm'
import TransferForm from '../TransferForm'
import { BankStatementModal } from '../BankStatementImporter'
import CategoryAccountManager from '../CategoryAccountManager'
import PeriodFilter from '../PeriodFilter'
import BudgetManager from '../BudgetManager'
import BudgetProgressCards from '../BudgetProgressCards'
import GoalsManager from '../GoalsManager/GoalsManager'
import FinancialFreedom from '../FinancialFreedom/FinancialFreedom'
import NetWorth from '../NetWorth/NetWorth'
import ToastNotifications from '../ToastNotifications'
import ConfirmDialog from '../ConfirmDialog'
import DashboardNavigation, { getDashboardSection } from '../DashboardNavigation/DashboardNavigation'
import { exportToCSV, formatExportFilename } from '../../utils/exportUtils'
import { notifications } from '../../utils/notifications'
import { TransferFormValues } from '../../utils/transfers'
import { useTheme } from '../../contexts/ThemeContext'

const pageDetails = {
  overview: { title: 'Overview', description: 'Your cash flow and the latest activity in the selected period.' },
  transactions: { title: 'Transactions', description: 'Search, review, and export your financial activity.' },
  analytics: { title: 'Analytics', description: 'Understand income, spending, and category patterns.' },
  budgets: { title: 'Budgets', description: 'Set spending limits and monitor progress.' },
  goals: { title: 'Goals', description: 'Plan savings targets and track each contribution.' },
  'net-worth': { title: 'Net worth', description: 'Your assets, liabilities and the value you have built.' },
  settings: { title: 'Settings', description: 'Manage the accounts and categories used in your transactions.' },
}

const freedomPath = '/dashboard/goals/financial-freedom'
const secondaryButton = 'min-h-11 items-center gap-2 whitespace-nowrap rounded-md border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800'
const toolbarButton = `inline-flex ${secondaryButton}`
const menuButton = 'flex w-full min-h-11 items-center gap-3 rounded-md px-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'

const Dashboard: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const section = getDashboardSection(location.pathname, '/dashboard')
  const analyticsView = getAnalyticsView(location.pathname, '/dashboard')
  const [period, setPeriod] = useState<PeriodFilterType>('month')
  const [dateRange, setDateRange] = useState<DateRange | null>(() => getDateRangeForPeriod('month'))
  const [showTransactionForm, setShowTransactionForm] = useState(false)
  const [showTransferForm, setShowTransferForm] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<any>(null)
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)
  const [showAmounts, setShowAmounts] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const menuTrigger = useRef<HTMLButtonElement>(null)

  const spendingDrafts = useSpendingDrafts()
  const data = useFinancialData(user?.id, dateRange)
  const { transactions, accounts, categories, budgets, loading, hasLoaded, loadedDateRange, error, refresh, addTransaction, addTransfer, updateTransaction, deleteTransaction, addAccount, deleteAccount, addCategory, deleteCategory, addBudget, updateBudget, deleteBudget } = data
  const summary = data.getFinancialSummaryForDateRange(loadedDateRange)
  const budgetProgress = data.getBudgetProgress(loadedDateRange)
  const isFreedom = location.pathname.replace(/\/$/, '') === freedomPath
  const details = isFreedom
    ? { title: 'Financial freedom', description: 'Estimate the capital you need and compare paths to your target.' }
    : pageDetails[section]

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

  // The form shows the error and stays open, so a failure is rethrown, not toasted here.
  const handleSaveTransfer = async (values: TransferFormValues, transferId: string) => {
    await addTransfer(values, transferId)
    setShowTransferForm(false)
    notifications.success('Transfer saved')
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

  const closeNavigation = () => {
    if (mobileNavOpen) menuTrigger.current?.focus()
    setMobileNavOpen(false)
  }
  const themeLabel = theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'
  const ThemeIcon = theme === 'light' ? Moon : Sun
  const initialLoading = loading && !hasLoaded
  const resultsPending = loading || !!error
  const periodPicker = <PeriodFilter period={period} dateRange={dateRange} onPeriodChange={handlePeriodChange} onCustomRangeChange={setCustomRange} />
  const resultsStatus = error ? (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 rounded-md border border-red-200 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:text-red-200">
      <p>{error}{hasLoaded && ' Showing the last loaded results.'}</p>
      <button type="button" onClick={refresh} className="rounded-md px-2 font-semibold underline">Retry</button>
    </div>
  ) : loading ? (
    <p role="status" className="text-sm text-gray-600 dark:text-gray-300">
      {hasLoaded ? 'Updating… Showing the last loaded results.' : 'Loading financial data…'}
    </p>
  ) : null

  return (
    <div className="dashboard-page min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-white">
      <DashboardNavigation basePath="/dashboard" isOpen={mobileNavOpen} onClose={closeNavigation} mobileActions={
        <>
          <button type="button" onClick={toggleTheme} className={menuButton}><ThemeIcon className="h-5 w-5" aria-hidden="true" />{themeLabel}</button>
          <button type="button" onClick={() => { closeNavigation(); setShowSignOutConfirm(true) }} className={menuButton}><LogOut className="h-5 w-5" aria-hidden="true" />Sign Out</button>
        </>
      } />
      <ToastNotifications />
      <a href="#dashboard-content" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-white focus:px-4 focus:py-3 focus:text-gray-900">Skip to content</a>
      <div className="min-h-screen lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur dark:border-gray-700 dark:bg-gray-800/95">
          <div className="flex min-h-16 items-center justify-between gap-3 px-4 lg:px-8">
            <button ref={menuTrigger} type="button" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation" aria-expanded={mobileNavOpen} aria-controls="dashboard-navigation" className="inline-flex items-center gap-2 rounded-md px-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 lg:hidden">
              <Menu className="h-5 w-5" aria-hidden="true" />Menu
            </button>
            <div className="hidden min-w-0 lg:block">
              <p className="truncate text-sm text-gray-600 dark:text-gray-300">{user?.user_metadata?.first_name || user?.email}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button type="button" onClick={openNewTransaction} disabled={loading || !hasLoaded} aria-label="Add Transaction" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary-600 px-3 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 sm:px-4">
                <Plus className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Add Transaction</span><span className="sm:hidden">Add</span>
              </button>
              <button type="button" onClick={toggleTheme} aria-label={themeLabel} className="hidden rounded-md p-3 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 lg:inline-flex">
                <ThemeIcon className="h-5 w-5" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => setShowSignOutConfirm(true)} className={`${secondaryButton} hidden lg:inline-flex`}>
                <LogOut className="h-4 w-4" aria-hidden="true" />Sign Out
              </button>
            </div>
          </div>
        </header>
        <main id="dashboard-content" tabIndex={-1} className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8">
          <div className="mb-4 sm:mb-6">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{details.title}</h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{details.description}</p>
          </div>
          {section === 'overview' && <div className="space-y-5 sm:space-y-8">
            <div className="space-y-3">{periodPicker}{resultsStatus}</div>
            {(hasLoaded || initialLoading) && <>
              <FinancialSummaryCards summary={summary} loading={initialLoading} showAmounts={showAmounts} onToggleAmounts={() => setShowAmounts(value => !value)} />
              <section aria-labelledby="recent-transactions" className="space-y-2 sm:space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 id="recent-transactions" className="text-xl font-semibold">Recent transactions</h2>
                  <NavLink to="/dashboard/transactions" className="inline-flex min-h-11 shrink-0 items-center rounded-md px-3 text-sm font-medium text-primary-700 hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-900/30">View all</NavLink>
                </div>
                <TransactionTable compact transactions={transactions.slice(0, 5)} loading={initialLoading} updating={resultsPending} onEdit={openEditTransaction} onDelete={handleDeleteTransaction} onAddTransaction={loading ? undefined : openNewTransaction} emptyDescription="No transactions in this period. Add one to start tracking your finances." />
              </section>
              {budgetProgress.length > 0 && <section aria-labelledby="budget-highlights">
                <h2 id="budget-highlights" className="mb-4 text-xl font-semibold">Budget highlights</h2>
                <BudgetProgressCards budgetProgress={budgetProgress} currency="IDR" />
              </section>}
            </>}
          </div>}
          {section === 'transactions' && <div className="space-y-5 sm:space-y-6">
            {periodPicker}
            <section aria-label="All transactions" className="space-y-3">
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Transaction actions">
                <button type="button" onClick={() => setShowImportModal(true)} disabled={loading || !hasLoaded} className={toolbarButton}><Upload className="h-4 w-4" aria-hidden="true" />Import statement</button>
                <button type="button" onClick={() => setShowTransferForm(true)} disabled={resultsPending || !hasLoaded} className={toolbarButton}><ArrowLeftRight className="h-4 w-4" aria-hidden="true" />Add transfer</button>
                <button type="button" onClick={handleExport} disabled={resultsPending || transactions.length === 0} className={toolbarButton}><Download className="h-4 w-4" aria-hidden="true" />Export CSV</button>
              </div>
              {resultsStatus}
              {(hasLoaded || initialLoading) && <TransactionTable transactions={transactions} accounts={accounts} categories={categories} loading={initialLoading} updating={resultsPending} onEdit={openEditTransaction} onDelete={handleDeleteTransaction} onAddTransaction={loading ? undefined : openNewTransaction} emptyDescription="No transactions in this period. Choose another period or add a transaction." />}
            </section>
          </div>}
          {section !== 'overview' && section !== 'transactions' && <>
            {resultsStatus}
            {section === 'analytics' && <div className="space-y-6">
              <AnalyticsNavigation basePath="/dashboard" view={analyticsView} />
              {analyticsView !== '/savings-preview' && periodPicker}
              {hasLoaded && <ConnectedSavingsAnalysis userId={user?.id} dateRange={dateRange} revision={transactions} spendingDrafts={spendingDrafts} view={analyticsView} />}
            </div>}
            {section === 'budgets' && hasLoaded && <div className="space-y-8">{budgetProgress.length > 0 && <BudgetProgressCards budgetProgress={budgetProgress} currency="IDR" />}<section aria-labelledby="budget-management"><h2 id="budget-management" className="mb-4 text-xl font-semibold">Manage budgets</h2><BudgetManager budgets={budgets} categories={categories} onAddBudget={async (budget: Omit<Budget, 'id' | 'created_at' | 'category'>) => { await addBudget(budget) }} onUpdateBudget={async (id, updates) => { await updateBudget(id, updates) }} onDeleteBudget={async id => { await deleteBudget(id) }} currency="IDR" /></section></div>}
            {section === 'goals' && hasLoaded && <div className="space-y-6">
              <nav aria-label="Goals subsections" className="flex flex-wrap gap-x-2 border-b border-gray-200 dark:border-gray-700">
                {[
                  { to: '/dashboard/goals', label: 'Savings goals' },
                  { to: freedomPath, label: 'Financial freedom' },
                ].map(({ to, label }) => <NavLink key={to} end to={to}
                  className={({ isActive }) => `inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-medium ${isActive
                    ? 'border-primary-600 text-primary-700 dark:border-primary-400 dark:text-blue-300'
                    : 'border-transparent text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'}`}>
                  {label}
                </NavLink>)}
              </nav>
              {isFreedom && user
                ? <FinancialFreedom userId={user.id} currencies={accounts.map(account => account.currency)} />
                : <GoalsManager key={user?.id} userId={user?.id} categories={categories} />}
            </div>}
            {section === 'net-worth' && hasLoaded && user && <NetWorth key={user.id} userId={user.id} accounts={accounts} />}
            {section === 'settings' && hasLoaded && <section aria-labelledby="account-settings"><h2 id="account-settings" className="mb-4 text-xl font-semibold">Accounts and categories</h2><CategoryAccountManager accounts={accounts} categories={categories} onAddAccount={async (name, currency) => { await addAccount(name, currency) }} onDeleteAccount={deleteAccount} onAddCategory={async (name, allowedType) => { await addCategory(name, allowedType) }} onDeleteCategory={deleteCategory} canDeleteCategory={category => !!user && category.user_id === user.id} /></section>}
          </>}
        </main>
      </div>
      {showTransactionForm && <TransactionForm transaction={editingTransaction} accounts={accounts} categories={categories} onSave={handleSaveTransaction} onCancel={closeTransactionForm} currency="IDR" />}
      {showTransferForm && <TransferForm accounts={accounts} onSave={handleSaveTransfer} onCancel={() => setShowTransferForm(false)} />}
      <BankStatementModal isOpen={showImportModal} onClose={() => setShowImportModal(false)} categories={categories} accounts={accounts} onImportSuccess={refresh} />
      <ConfirmDialog isOpen={showSignOutConfirm} title="Sign Out" message="Are you sure you want to sign out?" confirmLabel="Sign Out" cancelLabel="Cancel" variant="warning" onConfirm={async () => { setShowSignOutConfirm(false); await signOut(); navigate('/') }} onCancel={() => setShowSignOutConfirm(false)} />
    </div>
  )
}

export default Dashboard
