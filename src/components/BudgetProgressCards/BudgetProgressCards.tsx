import React from 'react'
import { BudgetProgress } from '../../types/financial'
import { AlertCircle } from 'lucide-react'

interface BudgetProgressCardsProps {
  budgetProgress: BudgetProgress[]
  currency?: string
  onShowBudgets?: () => void
  showBudgets?: boolean
}

const BudgetProgressCards: React.FC<BudgetProgressCardsProps> = ({
  budgetProgress,
  currency = 'IDR',
  onShowBudgets,
  showBudgets,
}) => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  if (budgetProgress.length === 0 && onShowBudgets) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700 space-y-4 transition-colors">
        <div className="flex justify-end">
          <button
            onClick={onShowBudgets}
            className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
          >
            {showBudgets ? 'Hide' : 'Manage'} Budgets
          </button>
        </div>
        <p className="text-center text-gray-500 dark:text-gray-400 py-4 transition-colors">
          No budgets set. Create budgets to track your spending!
        </p>
      </div>
    )
  }

  if (budgetProgress.length === 0) {
    return null
  }

  return (
    <div className="space-y-4">
      {onShowBudgets && (
        <div className="flex justify-end">
          <button
            onClick={onShowBudgets}
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
          >
            {showBudgets ? 'Hide' : 'Manage'} Budgets
          </button>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {budgetProgress.map((progress) => {
        const { budget, spent, remaining, percentage, isOverBudget } = progress
        const categoryName = budget.categories?.name || 'Unknown Category'

        return (
          <div
            key={budget.id}
            className={`bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 sm:p-6 border-2 ${
              isOverBudget 
                ? 'border-red-500 dark:border-red-600' 
                : 'border-gray-200 dark:border-gray-700'
            } hover:shadow-lg transition-all duration-300 hover:scale-105 animate-fadeInUp`}
            style={{ animationDelay: `${budgetProgress.indexOf(progress) * 50}ms` }}
          >
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className="flex-1 min-w-0">
                <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white transition-colors truncate">{categoryName}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 capitalize mt-1 transition-colors">
                  {budget.period} budget
                </p>
              </div>
              {isOverBudget && (
                <AlertCircle className="h-5 w-5 text-red-500" />
              )}
            </div>

            <div className="mb-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-600 dark:text-gray-300 transition-colors">Spent</span>
                <span className={isOverBudget ? 'font-bold text-red-600 dark:text-red-400' : 'font-semibold text-gray-900 dark:text-white transition-colors'}>
                  {formatCurrency(spent)}
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ease-out ${
                    isOverBudget
                      ? 'bg-red-500 dark:bg-red-600'
                      : percentage > 80
                      ? 'bg-yellow-500 dark:bg-yellow-600'
                      : 'bg-green-500 dark:bg-green-600'
                  }`}
                  style={{ width: `${Math.min(percentage, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs mt-2">
                <span className="text-gray-500 dark:text-gray-400 transition-colors">
                  {percentage.toFixed(1)}% of budget
                </span>
                <span className={`font-semibold ${isOverBudget ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'} transition-colors`}>
                  {isOverBudget ? `Over by ${formatCurrency(Math.abs(remaining))}` : `${formatCurrency(Math.abs(remaining))} remaining`}
                </span>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-200 dark:border-gray-700 transition-colors">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-300 transition-colors">Budget:</span>
                <span className="font-semibold text-gray-900 dark:text-white transition-colors">
                  {formatCurrency(budget.amount)}
                </span>
              </div>
            </div>
          </div>
        )
      })}
      </div>
    </div>
  )
}

export default BudgetProgressCards

