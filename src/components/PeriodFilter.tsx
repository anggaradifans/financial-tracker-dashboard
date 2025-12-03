import React from 'react'
import { PeriodFilter as PeriodFilterType, DateRange } from '../types/financial'
import { Calendar } from 'lucide-react'
import { format } from 'date-fns'

interface PeriodFilterProps {
  period: PeriodFilterType
  dateRange: DateRange | null
  onPeriodChange: (period: PeriodFilterType) => void
  onCustomRangeChange: (start: Date, end: Date) => void
}

const PeriodFilter: React.FC<PeriodFilterProps> = ({
  period,
  dateRange,
  onPeriodChange,
  onCustomRangeChange,
}) => {
  const [showCustomPicker, setShowCustomPicker] = React.useState(false)
  const [customStart, setCustomStart] = React.useState(
    dateRange?.start ? format(dateRange.start, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')
  )
  const [customEnd, setCustomEnd] = React.useState(
    dateRange?.end ? format(dateRange.end, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')
  )

  const handleCustomRangeSubmit = () => {
    const start = new Date(customStart)
    const end = new Date(customEnd)
    
    if (start > end) {
      alert('Start date must be before end date')
      return
    }
    
    onCustomRangeChange(start, end)
    setShowCustomPicker(false)
  }

  const periods: Array<{ value: PeriodFilterType; label: string }> = [
    { value: 'today', label: 'Today' },
    { value: 'week', label: 'This Week' },
    { value: 'month', label: 'This Month' },
    { value: 'year', label: 'This Year' },
    { value: 'custom', label: 'Custom Range' },
  ]

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-3 sm:p-4 border border-gray-200 dark:border-gray-700 transition-colors duration-300 animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-gray-500 dark:text-gray-400" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors">Period:</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {periods.map((p) => (
            <button
              key={p.value}
              onClick={() => {
                if (p.value === 'custom') {
                  setShowCustomPicker(true)
                } else {
                  onPeriodChange(p.value)
                }
              }}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                period === p.value
                  ? 'bg-primary-600 dark:bg-primary-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {dateRange && period !== 'custom' && (
          <span className="text-xs text-gray-500 dark:text-gray-400 sm:ml-auto transition-colors text-center sm:text-right">
            {format(dateRange.start, 'MMM dd')} - {format(dateRange.end, 'MMM dd, yyyy')}
          </span>
        )}
      </div>

      {showCustomPicker && (
        <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-md border border-gray-200 dark:border-gray-700 transition-colors animate-slideDown">
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 transition-colors">
                Start Date
              </label>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 transition-colors"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 transition-colors">
                End Date
              </label>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 transition-colors"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCustomRangeSubmit}
                className="px-4 py-2 bg-primary-600 dark:bg-primary-500 text-white text-sm rounded-md hover:bg-primary-700 dark:hover:bg-primary-600 transition-colors"
              >
                Apply
              </button>
              <button
                onClick={() => setShowCustomPicker(false)}
                className="px-4 py-2 bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-md hover:bg-gray-400 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PeriodFilter
