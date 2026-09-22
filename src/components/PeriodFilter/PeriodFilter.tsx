import React, { useId, useRef, useState } from 'react'
import { PeriodFilter as PeriodFilterType, DateRange } from '../../types/financial'
import { Calendar } from 'lucide-react'
import { endOfDay, format, isValid, parseISO, startOfDay } from 'date-fns'

interface PeriodFilterProps {
  period: PeriodFilterType
  dateRange: DateRange | null
  onPeriodChange: (period: PeriodFilterType) => void
  onCustomRangeChange: (start: Date, end: Date) => void
}

const PeriodFilter: React.FC<PeriodFilterProps> = ({ period, dateRange, onPeriodChange, onCustomRangeChange }) => {
  const id = useId()
  const customButton = useRef<HTMLButtonElement>(null)
  const [showCustomPicker, setShowCustomPicker] = useState(false)
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [error, setError] = useState('')

  const closePicker = () => {
    setShowCustomPicker(false)
    customButton.current?.focus()
  }

  const applyRange = (event: React.FormEvent) => {
    event.preventDefault()
    const start = startOfDay(parseISO(customStart))
    const end = endOfDay(parseISO(customEnd))
    if (!isValid(start) || !isValid(end)) {
      setError('Choose a start date and an end date.')
      return
    }
    if (start > end) {
      setError('End date must be on or after the start date.')
      return
    }
    onCustomRangeChange(start, end)
    closePicker()
  }

  const periods: Array<{ value: PeriodFilterType; label: string }> = [
    { value: 'today', label: 'Today' },
    { value: 'week', label: 'This Week' },
    { value: 'month', label: 'This Month' },
    { value: 'year', label: 'This Year' },
    { value: 'custom', label: 'Custom Range' },
  ]

  return (
    <section aria-label="Reporting period" className="period-filter border-y border-gray-200 dark:border-gray-700 py-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
          <Calendar className="h-4 w-4" aria-hidden="true" /> Period
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Choose reporting period">
          {periods.map(p => (
            <button key={p.value} ref={p.value === 'custom' ? customButton : undefined}
              aria-pressed={period === p.value}
              aria-expanded={p.value === 'custom' ? showCustomPicker : undefined}
              aria-controls={p.value === 'custom' ? `${id}-picker` : undefined}
              onClick={() => {
                setError('')
                if (p.value === 'custom') {
                  setCustomStart(format(dateRange?.start ?? new Date(), 'yyyy-MM-dd'))
                  setCustomEnd(format(dateRange?.end ?? new Date(), 'yyyy-MM-dd'))
                  setShowCustomPicker(!showCustomPicker)
                } else {
                  setShowCustomPicker(false)
                  onPeriodChange(p.value)
                }
              }}
              className={`min-h-11 px-3 rounded-md text-sm font-medium ${period === p.value ? 'bg-primary-600 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
            >{p.label}</button>
          ))}
        </div>
        {dateRange && <p className="text-sm text-gray-600 dark:text-gray-400 md:ml-auto" aria-live="polite">{format(dateRange.start, 'MMM d, yyyy')} – {format(dateRange.end, 'MMM d, yyyy')}</p>}
      </div>
      {showCustomPicker && (
        <form id={`${id}-picker`} onSubmit={applyRange} noValidate onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); closePicker() } }} className="mt-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] gap-4 items-end">
            {[
              { name: 'start', label: 'Start Date', value: customStart, set: setCustomStart },
              { name: 'end', label: 'End Date', value: customEnd, set: setCustomEnd },
            ].map(field => (
              <div key={field.name} className="min-w-0">
                <label htmlFor={`${id}-${field.name}`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{field.label}</label>
                <input id={`${id}-${field.name}`} type="date" required autoFocus={field.name === 'start'} value={field.value} onChange={event => { field.set(event.target.value); setError('') }} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} className="min-h-11 w-full min-w-0 rounded-md border border-gray-400 dark:border-gray-500 bg-white dark:bg-gray-900 px-3 py-2 text-gray-900 dark:text-white [color-scheme:light] dark:[color-scheme:dark]" />
              </div>
            ))}
            <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
              <button type="submit" className="min-h-11 rounded-md bg-primary-600 hover:bg-primary-700 text-white px-4 text-sm font-medium">Apply</button>
              <button type="button" onClick={closePicker} className="min-h-11 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 px-4 text-sm hover:bg-gray-100 dark:hover:bg-gray-700">Cancel</button>
            </div>
          </div>
          {error && <p id={`${id}-error`} role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">{error}</p>}
        </form>
      )}
    </section>
  )
}

export default PeriodFilter
