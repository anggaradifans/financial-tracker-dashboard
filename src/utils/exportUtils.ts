import { Transaction } from '../types/financial'
import { format } from 'date-fns'

/**
 * Export transactions to CSV format
 */
export const exportToCSV = (
  transactions: Transaction[],
  filename: string = 'transactions.csv'
) => {
  if (transactions.length === 0) {
    throw new Error('No transactions to export')
  }

  // CSV Headers
  const headers = [
    'Date',
    'Type',
    'Category',
    'Account',
    'Amount',
    'Currency',
    'Description',
  ]

  // Convert transactions to CSV rows
  const rows = transactions.map((tx) => [
    format(new Date(tx.occurred_at), 'yyyy-MM-dd'),
    tx.type,
    tx.category?.name || 'Uncategorized',
    tx.account?.name || '',
    tx.amount.toString(),
    tx.currency,
    tx.description || '',
  ])

  // Combine headers and rows
  const csvContent = [
    headers.join(','),
    ...rows.map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ),
  ].join('\n')

  // Create blob and download
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)

  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.style.visibility = 'hidden'

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  URL.revokeObjectURL(url)
}

/**
 * Format filename with date range
 */
export const formatExportFilename = (
  prefix: string = 'transactions',
  dateRange?: { start: Date; end: Date } | null
): string => {
  if (dateRange) {
    const start = format(dateRange.start, 'yyyy-MM-dd')
    const end = format(dateRange.end, 'yyyy-MM-dd')
    return `${prefix}_${start}_to_${end}.csv`
  }
  return `${prefix}_${format(new Date(), 'yyyy-MM-dd')}.csv`
}

