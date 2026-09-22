import React from 'react'
import { FinancialSummary } from '../../types/financial'
import { TrendingUp, TrendingDown, Eye, EyeOff } from 'lucide-react'

interface FinancialSummaryCardsProps {
  summary: FinancialSummary
  currency?: string
  showAmounts?: boolean
  onToggleAmounts?: () => void
}

const FinancialSummaryCards: React.FC<FinancialSummaryCardsProps> = ({
  summary,
  currency = 'IDR',
  showAmounts = true,
  onToggleAmounts,
}) => {
  const formatCurrency = (amount: number) => new Intl.NumberFormat('id-ID', {
    style: 'currency', currency, maximumFractionDigits: 0,
  }).format(amount)

  return (
    <section aria-label="Period overview" className="financial-summary space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Period overview</h2>
        {onToggleAmounts && (
          <button onClick={onToggleAmounts} aria-pressed={showAmounts} className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
            {showAmounts ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
            {showAmounts ? 'Hide' : 'Show'} Amounts
          </button>
        )}
      </div>
      <dl className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="min-w-0 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 p-5 sm:p-6">
          <dt className="text-sm font-medium text-blue-900 dark:text-blue-100">Net Balance</dt>
          <dd className="mt-3 text-2xl lg:text-3xl font-semibold tracking-tight tabular-nums text-blue-900 dark:text-blue-100 break-words">{showAmounts ? formatCurrency(summary.netBalance) : '••••••'}</dd>
          <p className="mt-2 text-sm text-blue-800 dark:text-blue-200">Income minus outcome</p>
        </div>
        {[
          { title: 'Total Income', value: summary.totalIncome, Icon: TrendingUp, color: 'text-green-700 dark:text-green-400' },
          { title: 'Total Outcome', value: summary.totalOutcome, Icon: TrendingDown, color: 'text-red-700 dark:text-red-400' },
        ].map(({ title, value, Icon, color }) => (
          <div key={title} className="min-w-0 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 sm:p-6">
            <dt className="flex items-center justify-between gap-3 text-sm font-medium text-gray-600 dark:text-gray-300">{title}<Icon className={`h-5 w-5 ${color}`} aria-hidden="true" /></dt>
            <dd className="mt-3 text-2xl lg:text-3xl font-semibold tracking-tight tabular-nums text-gray-900 dark:text-white break-words">{showAmounts ? formatCurrency(value) : '••••••'}</dd>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">In the selected period</p>
          </div>
        ))}
      </dl>
    </section>
  )
}

export default FinancialSummaryCards
