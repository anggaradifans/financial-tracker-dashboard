import React from 'react'
import { CategoryBreakdown, Transaction, DateRange } from '../../types/financial'
import { TrendingUp, TrendingDown, Award, DollarSign } from 'lucide-react'

interface InsightsSectionProps {
  transactions: Transaction[]
  categoryBreakdown: CategoryBreakdown[]
  dateRange?: DateRange | null
  currency?: string
}

const InsightsSection: React.FC<InsightsSectionProps> = ({
  transactions,
  categoryBreakdown,
  dateRange,
  currency = 'IDR',
}) => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  // Filter transactions by date range if provided
  const filteredTransactions = dateRange
    ? transactions.filter(t => {
        const txDate = new Date(t.occurred_at)
        return txDate >= dateRange.start && txDate <= dateRange.end
      })
    : transactions

  // Get top spending categories
  const topExpenseCategories = categoryBreakdown
    .filter(c => c.type === 'outcome')
    .slice(0, 5)

  // Get top income categories
  const topIncomeCategories = categoryBreakdown
    .filter(c => c.type === 'income')
    .slice(0, 5)

  // Calculate averages based on filtered transactions
  // Standard calculation: Total spending / Total days in the selected period
  const totalOutcome = filteredTransactions
    .filter(t => t.type === 'outcome')
    .reduce((sum, t) => sum + Number(t.amount), 0)
  
  // Calculate total days in the period
  let totalDaysInPeriod = 1
  if (dateRange) {
    const start = dateRange.start
    const end = dateRange.end
    const diffTime = Math.abs(end.getTime() - start.getTime())
    totalDaysInPeriod = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1 // +1 to include both start and end day
  } else if (filteredTransactions.length > 0) {
    // If no date range, calculate from first to last transaction
    const dates = filteredTransactions.map(t => new Date(t.occurred_at).getTime())
    const earliest = new Date(Math.min(...dates))
    const latest = new Date(Math.max(...dates))
    const diffTime = Math.abs(latest.getTime() - earliest.getTime())
    totalDaysInPeriod = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1
  }
  
  const dailyAverage = totalDaysInPeriod > 0 ? totalOutcome / totalDaysInPeriod : 0
  const weeklyAverage = dailyAverage * 7
  const monthlyAverage = dailyAverage * 30

  // Get largest transactions from filtered data
  const largestExpense = filteredTransactions
    .filter(t => t.type === 'outcome')
    .sort((a, b) => Number(b.amount) - Number(a.amount))[0]

  const largestIncome = filteredTransactions
    .filter(t => t.type === 'income')
    .sort((a, b) => Number(b.amount) - Number(a.amount))[0]

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Categories */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Expense Categories */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 sm:p-6 border border-gray-200 dark:border-gray-700 transition-colors duration-300">
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <TrendingDown className="h-4 w-4 sm:h-5 sm:w-5 text-red-500 dark:text-red-400" />
            <h3 className="text-base sm:text-lg font-semibold text-gray-800 dark:text-white transition-colors">
              Top Outcome Categories
            </h3>
          </div>
          {topExpenseCategories.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 transition-colors">No outcome data available</p>
          ) : (
            <div className="space-y-3">
              {topExpenseCategories.map((category, index) => (
                <div key={category.category_id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                      <span className="text-red-600 dark:text-red-400 font-semibold text-sm transition-colors">
                        {index + 1}
                      </span>
                    </div>
                    <span className="font-medium text-gray-900 dark:text-white transition-colors">
                      {category.category_name}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-red-600 dark:text-red-400 transition-colors">
                      {formatCurrency(category.amount)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 transition-colors">{category.count} transactions</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Income Categories */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 sm:p-6 border border-gray-200 dark:border-gray-700 transition-colors duration-300">
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 dark:text-green-400" />
            <h3 className="text-base sm:text-lg font-semibold text-gray-800 dark:text-white transition-colors">
              Top Income Categories
            </h3>
          </div>
          {topIncomeCategories.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 transition-colors">No income data available</p>
          ) : (
            <div className="space-y-3">
              {topIncomeCategories.map((category, index) => (
                <div key={category.category_id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                      <span className="text-green-600 dark:text-green-400 font-semibold text-sm transition-colors">
                        {index + 1}
                      </span>
                    </div>
                    <span className="font-medium text-gray-900 dark:text-white transition-colors">
                      {category.category_name}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-green-600 dark:text-green-400 transition-colors">
                      {formatCurrency(category.amount)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 transition-colors">{category.count} transactions</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Averages and Largest Transactions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Average Spending */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 sm:p-6 border border-gray-200 dark:border-gray-700 transition-colors duration-300">
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <DollarSign className="h-4 w-4 sm:h-5 sm:w-5 text-blue-500 dark:text-blue-400" />
            <h3 className="text-base sm:text-lg font-semibold text-gray-800 dark:text-white transition-colors">Average Spending</h3>
          </div>
          <div className="space-y-2 sm:space-y-3">
            <div>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 transition-colors">Daily Average</p>
              <p className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white transition-colors">
                {formatCurrency(dailyAverage)}
              </p>
            </div>
            <div>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 transition-colors">Weekly Average</p>
              <p className="text-base sm:text-lg font-semibold text-gray-700 dark:text-gray-300 transition-colors">
                {formatCurrency(weeklyAverage)}
              </p>
            </div>
            <div>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 transition-colors">Monthly Average</p>
              <p className="text-base sm:text-lg font-semibold text-gray-700 dark:text-gray-300 transition-colors">
                {formatCurrency(monthlyAverage)}
              </p>
            </div>
          </div>
        </div>

        {/* Largest Expense */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 sm:p-6 border border-gray-200 dark:border-gray-700 transition-colors duration-300">
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <Award className="h-4 w-4 sm:h-5 sm:w-5 text-red-500 dark:text-red-400" />
            <h3 className="text-base sm:text-lg font-semibold text-gray-800 dark:text-white transition-colors">Largest Outcome</h3>
          </div>
          {largestExpense ? (
            <div>
              <p className="text-xl sm:text-2xl font-bold text-red-600 dark:text-red-400 mb-2 transition-colors">
                {formatCurrency(Number(largestExpense.amount))}
              </p>
              <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 font-medium transition-colors">
                {largestExpense.category?.name || 'Uncategorized'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 transition-colors line-clamp-2">
                {largestExpense.description || 'No description'}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 transition-colors">
                {new Date(largestExpense.occurred_at).toLocaleDateString()}
              </p>
            </div>
          ) : (
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 transition-colors">No outcome data available</p>
          )}
        </div>

        {/* Largest Income */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 sm:p-6 border border-gray-200 dark:border-gray-700 transition-colors duration-300">
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <Award className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 dark:text-green-400" />
            <h3 className="text-base sm:text-lg font-semibold text-gray-800 dark:text-white transition-colors">Largest Income</h3>
          </div>
          {largestIncome ? (
            <div>
              <p className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400 mb-2 transition-colors">
                {formatCurrency(Number(largestIncome.amount))}
              </p>
              <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 font-medium transition-colors">
                {largestIncome.category?.name || 'Uncategorized'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 transition-colors line-clamp-2">
                {largestIncome.description || 'No description'}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 transition-colors">
                {new Date(largestIncome.occurred_at).toLocaleDateString()}
              </p>
            </div>
          ) : (
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 transition-colors">No income data available</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default InsightsSection
