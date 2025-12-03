import React from 'react'
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { CategoryBreakdown, TimeSeriesData } from '../types/financial'
import { format } from 'date-fns'

interface FinancialChartsProps {
  timeSeriesData: TimeSeriesData[]
  categoryBreakdown: CategoryBreakdown[]
  currency?: string
}

const FinancialCharts: React.FC<FinancialChartsProps> = ({
  timeSeriesData,
  categoryBreakdown,
  currency = 'IDR',
}) => {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  // Prepare data for charts
  const incomeVsOutcomeData = timeSeriesData.map(item => ({
    date: format(new Date(item.date), 'MMM dd'),
    income: Number(item.income),
    outcome: Number(item.outcome),
    net: Number(item.net),
  }))

  const outcomeCategories = categoryBreakdown
    .filter(c => c.type === 'outcome')
    .slice(0, 6)
    .map(c => ({
      name: c.category_name,
      value: Number(c.amount),
    }))

  const incomeCategories = categoryBreakdown
    .filter(c => c.type === 'income')
    .slice(0, 6)
    .map(c => ({
      name: c.category_name,
      value: Number(c.amount),
    }))

  // Colors for pie chart
  const COLORS = [
    '#0088FE',
    '#00C49F',
    '#FFBB28',
    '#FF8042',
    '#8884D8',
    '#82CA9D',
    '#FFC658',
    '#FF6B6B',
  ]

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-gray-800 p-3 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg transition-colors">
          <p className="font-semibold mb-2 text-gray-900 dark:text-white">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }} className="text-sm text-gray-700 dark:text-gray-300">
              {entry.name}: {formatCurrency(entry.value)}
            </p>
          ))}
        </div>
      )
    }
    return null
  }

  return (
    <div className="space-y-4 sm:space-y-6 animate-fadeIn">
      {/* Income vs Outcome Line Chart */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 sm:p-6 border border-gray-200 dark:border-gray-700 transition-colors duration-300">
        <h3 className="text-base sm:text-lg font-semibold text-gray-800 dark:text-white mb-3 sm:mb-4 transition-colors">
          Income vs Outcome Trend
        </h3>
        <ResponsiveContainer width="100%" height={250} className="sm:h-[300px]">
          <LineChart data={incomeVsOutcomeData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis tickFormatter={(value) => formatCurrency(value)} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Line
              type="monotone"
              dataKey="income"
              stroke="#10b981"
              strokeWidth={2}
              name="Income"
            />
            <Line
              type="monotone"
              dataKey="outcome"
              stroke="#ef4444"
              strokeWidth={2}
              name="Outcome"
            />
            <Line
              type="monotone"
              dataKey="net"
              stroke="#3b82f6"
              strokeWidth={2}
              strokeDasharray="5 5"
              name="Net Balance"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Outcome Categories Pie Chart */}
            {outcomeCategories.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 sm:p-6 border border-gray-200 dark:border-gray-700 transition-colors duration-300 animate-fadeInUp">
                <h3 className="text-base sm:text-lg font-semibold text-gray-800 dark:text-white mb-3 sm:mb-4 transition-colors">
                  Outcome by Category
                </h3>
                <ResponsiveContainer width="100%" height={250} className="sm:h-[300px]">
              <PieChart>
                <Pie
                  data={outcomeCategories}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry: any) => {
                    const total = outcomeCategories.reduce((sum, cat) => sum + cat.value, 0)
                    const percent = (entry.value / total) * 100
                    return `${entry.name} ${percent.toFixed(0)}%`
                  }}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {outcomeCategories.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Income Categories Pie Chart */}
            {incomeCategories.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 sm:p-6 border border-gray-200 dark:border-gray-700 transition-colors duration-300 animate-fadeInUp" style={{ animationDelay: '100ms' }}>
                <h3 className="text-base sm:text-lg font-semibold text-gray-800 dark:text-white mb-3 sm:mb-4 transition-colors">
              Income by Category
            </h3>
            <ResponsiveContainer width="100%" height={250} className="sm:h-[300px]">
              <PieChart>
                <Pie
                  data={incomeCategories}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry: any) => {
                    const total = incomeCategories.reduce((sum, cat) => sum + cat.value, 0)
                    const percent = (entry.value / total) * 100
                    return `${entry.name} ${percent.toFixed(0)}%`
                  }}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {incomeCategories.map((_, index) => (
                    <Cell
                      key={`cell-income-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}

export default FinancialCharts
