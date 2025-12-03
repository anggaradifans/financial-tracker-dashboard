import React, { useState, useMemo, useEffect } from 'react'
import { Transaction, TransactionType } from '../types/financial'
import { format } from 'date-fns'
import { Edit, Trash2, Search, Filter, ChevronLeft, ChevronRight } from 'lucide-react'
import { TableRowSkeleton } from './SkeletonLoader'
import EmptyState from './EmptyState'
import ConfirmDialog from './ConfirmDialog'
import { Receipt } from 'lucide-react'

interface TransactionTableProps {
  transactions: Transaction[]
  onEdit: (transaction: Transaction) => void
  onDelete: (id: string) => void
  loading?: boolean
  currency?: string
  onAddTransaction?: () => void
}

const TransactionTable: React.FC<TransactionTableProps> = ({
  transactions,
  onEdit,
  onDelete,
  loading,
  currency = 'IDR',
  onAddTransaction,
}) => {
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; description: string } | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState<TransactionType | 'all'>('all')
  const [sortBy, setSortBy] = useState<'date' | 'amount'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  // Filter and sort transactions
  const filteredAndSortedTransactions = useMemo(() => {
    return transactions
      .filter(t => {
        const matchesSearch =
          t.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          t.category?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          t.account?.name.toLowerCase().includes(searchTerm.toLowerCase())
        const matchesType = typeFilter === 'all' || t.type === typeFilter
        return matchesSearch && matchesType
      })
      .sort((a, b) => {
        let comparison = 0
        if (sortBy === 'date') {
          comparison =
            new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()
        } else {
          comparison = Number(a.amount) - Number(b.amount)
        }
        return sortOrder === 'asc' ? comparison : -comparison
      })
  }, [transactions, searchTerm, typeFilter, sortBy, sortOrder])

  // Calculate pagination
  const totalPages = Math.ceil(filteredAndSortedTransactions.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedTransactions = filteredAndSortedTransactions.slice(startIndex, endIndex)

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, typeFilter, sortBy, sortOrder])

  const filteredTransactions = paginatedTransactions

  const handleSort = (newSortBy: 'date' | 'amount') => {
    if (sortBy === newSortBy) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(newSortBy)
      setSortOrder('desc')
    }
  }

  const handleDeleteClick = (transaction: Transaction) => {
    setDeleteConfirm({
      id: transaction.id,
      description: transaction.description || 'this transaction',
    })
  }

  const handleDeleteConfirm = () => {
    if (deleteConfirm) {
      onDelete(deleteConfirm.id)
      setDeleteConfirm(null)
    }
  }

  return (
    <>
      <ConfirmDialog
        isOpen={!!deleteConfirm}
        title="Delete Transaction"
        message={`Are you sure you want to delete "${deleteConfirm?.description}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteConfirm(null)}
        variant="danger"
      />
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 transition-colors duration-300">
      {/* Filters */}
      <div className="p-3 sm:p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 transition-colors">
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              placeholder="Search transactions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 sm:pl-10 pr-3 sm:pr-4 py-2 text-sm sm:text-base border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 transition-colors"
            />
          </div>
          <div className="flex gap-2 items-center">
            <Filter className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400 dark:text-gray-500" />
            <select
              value={typeFilter}
              onChange={(e) =>
                setTypeFilter(e.target.value as TransactionType | 'all')
              }
              className="flex-1 sm:flex-none px-3 sm:px-4 py-2 text-sm sm:text-base border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 transition-colors"
            >
              <option value="all">All Types</option>
              <option value="income">Income</option>
              <option value="outcome">Outcome</option>
            </select>
          </div>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3 p-4">
        {loading ? (
          <>
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 animate-pulse">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
              </div>
            ))}
          </>
        ) : filteredAndSortedTransactions.length === 0 ? (
          <div className="text-center py-8">
            {transactions.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title="No transactions yet"
                description="Start tracking your finances by adding your first transaction"
                action={onAddTransaction ? {
                  label: 'Add Transaction',
                  onClick: onAddTransaction,
                } : undefined}
              />
            ) : (
              <p className="text-gray-500 dark:text-gray-400 transition-colors">No transactions match your filters.</p>
            )}
          </div>
        ) : (
          filteredTransactions.map((transaction) => (
            <div
              key={transaction.id}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 space-y-3 animate-fadeIn"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      transaction.type === 'income'
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200'
                        : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200'
                    } transition-colors`}>
                      {transaction.category?.name || 'Uncategorized'}
                    </span>
                    <span className={`text-sm font-bold ${
                      transaction.type === 'income'
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    } transition-colors`}>
                      {transaction.type === 'income' ? '+' : '-'}
                      {formatCurrency(Number(transaction.amount))}
                    </span>
                  </div>
                  {transaction.description && (
                    <p className="text-sm text-gray-700 dark:text-gray-300 mb-1 line-clamp-2">{transaction.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                    <span>{format(new Date(transaction.occurred_at), 'MMM dd, yyyy')}</span>
                    {transaction.account?.name && (
                      <span>• {transaction.account.name}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <button
                    onClick={() => onEdit(transaction)}
                    className="p-2 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-md transition-colors"
                    title="Edit"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteClick(transaction)}
                    className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900/50 transition-colors">
            <tr>
              <th
                onClick={() => handleSort('date')}
                className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Date
                {sortBy === 'date' && (
                  <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                )}
              </th>
              <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider transition-colors">
                Category
              </th>
              <th className="hidden lg:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider transition-colors">
                Account
              </th>
              <th className="hidden xl:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider transition-colors">
                Description
              </th>
              <th
                onClick={() => handleSort('amount')}
                className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Amount
                {sortBy === 'amount' && (
                  <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                )}
              </th>
              <th className="px-3 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider transition-colors">
                Actions
              </th>
            </tr>
          </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700 transition-colors">
            {loading ? (
              <>
                <TableRowSkeleton />
                <TableRowSkeleton />
                <TableRowSkeleton />
                <TableRowSkeleton />
                <TableRowSkeleton />
              </>
            ) : filteredAndSortedTransactions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8">
                  {transactions.length === 0 ? (
                    <EmptyState
                      icon={Receipt}
                      title="No transactions yet"
                      description="Start tracking your finances by adding your first transaction"
                      action={onAddTransaction ? {
                        label: 'Add Transaction',
                        onClick: onAddTransaction,
                      } : undefined}
                    />
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-gray-500 dark:text-gray-400 transition-colors">No transactions match your filters.</p>
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              filteredTransactions.map((transaction) => (
                <tr key={transaction.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors animate-fadeIn">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 transition-colors">
                    {format(new Date(transaction.occurred_at), 'MMM dd, yyyy')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 transition-colors">
                      {transaction.category?.name || 'Uncategorized'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 transition-colors">
                    {transaction.account?.name || '—'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 transition-colors">
                    {transaction.description || '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`text-sm font-semibold ${
                        transaction.type === 'income'
                          ? 'text-green-600'
                          : 'text-red-600'
                      }`}
                    >
                      {transaction.type === 'income' ? '+' : '-'}
                      {formatCurrency(Number(transaction.amount))}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end space-x-2">
                      <button
                        onClick={() => onEdit(transaction)}
                        className="p-2 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-md transition-colors"
                        title="Edit"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteClick(transaction)}
                        className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors"
                        title="Delete transaction"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination and Summary */}
      <div className="px-3 sm:px-6 py-3 sm:py-4 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 transition-colors">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-3 sm:gap-4">
          {/* Pagination Info */}
          <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 transition-colors text-center sm:text-left">
            Showing {startIndex + 1} to {Math.min(endIndex, filteredAndSortedTransactions.length)} of{' '}
            {filteredAndSortedTransactions.length}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto justify-center">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-2.5 sm:px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4 inline" />
                <span className="hidden sm:inline ml-1">Previous</span>
              </button>
              
              <div className="flex items-center gap-0.5 sm:gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(page => {
                    // Show first page, last page, current page, and pages around current
                    return (
                      page === 1 ||
                      page === totalPages ||
                      (page >= currentPage - 1 && page <= currentPage + 1)
                    )
                  })
                  .map((page, index, array) => {
                    // Add ellipsis if needed
                    const prevPage = array[index - 1]
                    const showEllipsis = prevPage && page - prevPage > 1
                    
                    return (
                      <React.Fragment key={page}>
                        {showEllipsis && (
                          <span className="px-1 sm:px-2 text-gray-500 dark:text-gray-400 transition-colors text-xs sm:text-sm">...</span>
                        )}
                        <button
                          onClick={() => setCurrentPage(page)}
                          className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                            currentPage === page
                              ? 'bg-primary-600 dark:bg-primary-500 text-white'
                              : 'border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600'
                          }`}
                        >
                          {page}
                        </button>
                      </React.Fragment>
                    )
                  })}
              </div>

              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-2.5 sm:px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <span className="hidden sm:inline mr-1">Next</span>
                <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 inline" />
              </button>
            </div>
          )}

          {/* Summary for current page */}
          {filteredTransactions.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 text-xs sm:text-sm w-full sm:w-auto">
              <span className="text-green-600 dark:text-green-400 font-semibold transition-colors text-center sm:text-left">
                Income: {formatCurrency(
                  filteredTransactions
                    .filter(t => t.type === 'income')
                    .reduce((sum, t) => sum + Number(t.amount), 0)
                )}
              </span>
              <span className="text-red-600 dark:text-red-400 font-semibold transition-colors text-center sm:text-left">
                Outcome: {formatCurrency(
                  filteredTransactions
                    .filter(t => t.type === 'outcome')
                    .reduce((sum, t) => sum + Number(t.amount), 0)
                )}
              </span>
            </div>
          )}
        </div>
      </div>
      </div>
    </>
  )
}

export default TransactionTable
