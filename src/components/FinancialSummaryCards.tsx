import React from 'react'
import { FinancialSummary } from '../types/financial'
import { TrendingUp, TrendingDown, DollarSign, Eye, EyeOff } from 'lucide-react'

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
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const maskedValue = '••••••'

  const cards = [
    {
      title: 'Total Income',
      value: formatCurrency(summary.totalIncome),
      icon: TrendingUp,
      color: 'bg-green-500',
      bgColor: 'bg-green-50',
      textColor: 'text-green-700',
    },
    {
      title: 'Total Outcome',
      value: formatCurrency(summary.totalOutcome),
      icon: TrendingDown,
      color: 'bg-red-500',
      bgColor: 'bg-red-50',
      textColor: 'text-red-700',
    },
    {
      title: 'Net Balance',
      value: formatCurrency(summary.netBalance),
      icon: DollarSign,
      color: summary.netBalance >= 0 ? 'bg-blue-500' : 'bg-orange-500',
      bgColor: summary.netBalance >= 0 ? 'bg-blue-50' : 'bg-orange-50',
      textColor: summary.netBalance >= 0 ? 'text-blue-700' : 'text-orange-700',
    },
    // {
    //   title: 'Account Balance',
    //   value: formatCurrency(summary.accountBalance),
    //   icon: Wallet,
    //   color: 'bg-indigo-500',
    //   bgColor: 'bg-indigo-50',
    //   textColor: 'text-indigo-700',
    // },
  ]

  return (
    <div className="space-y-4">
      {onToggleAmounts && (
        <div className="flex justify-end animate-slideDown">
          <button
            onClick={onToggleAmounts}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
            title={showAmounts ? 'Hide amounts' : 'Show amounts'}
          >
            {showAmounts ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {showAmounts ? 'Hide' : 'Show'} Amounts
          </button>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {cards.map((card, index) => {
        const Icon = card.icon
        return (
          <div
            key={index}
            className={`${card.bgColor} dark:bg-gray-800 rounded-lg shadow-md p-4 sm:p-6 border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-all duration-300 hover:scale-105 animate-fadeInUp`}
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className={`text-xs sm:text-sm font-medium ${card.textColor} dark:text-gray-300 opacity-80 truncate`}>
                  {card.title}
                </p>
                <p className={`text-xl sm:text-2xl font-bold ${card.textColor} dark:text-white mt-1 sm:mt-2 truncate`}>
                  {showAmounts ? card.value : maskedValue}
                </p>
              </div>
              <div className={`${card.color} dark:opacity-90 p-2 sm:p-3 rounded-lg flex-shrink-0 ml-2`}>
                <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              </div>
            </div>
          </div>
        )
      })}
      </div>
    </div>
  )
}

export default FinancialSummaryCards
