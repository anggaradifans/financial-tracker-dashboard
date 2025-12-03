import React, { useState, useEffect } from 'react'
import { Transaction, Account, Category, TransactionType } from '../../types/financial'
import { format } from 'date-fns'
import { X, Loader2 } from 'lucide-react'
import { notifications } from '../../utils/notifications'

interface TransactionFormProps {
  transaction?: Transaction | null
  accounts: Account[]
  categories: Category[]
  onSave: (transaction: Omit<Transaction, 'id' | 'created_at' | 'account' | 'category'>) => Promise<void>
  onCancel: () => void
  currency?: string
}

const TransactionForm: React.FC<TransactionFormProps> = ({
  transaction,
  accounts,
  categories,
  onSave,
  onCancel,
  currency = 'IDR',
}) => {
  const [formData, setFormData] = useState({
    type: (transaction?.type || 'outcome') as TransactionType,
    amount: transaction?.amount?.toString() || '',
    currency: transaction?.currency || currency,
    description: transaction?.description || '',
    occurred_at: transaction?.occurred_at
      ? format(new Date(transaction.occurred_at), 'yyyy-MM-dd')
      : format(new Date(), 'yyyy-MM-dd'),
    category_id: transaction?.category_id || '',
    account_id: transaction?.account_id || '',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  // Filter categories based on type
  const availableCategories = categories.filter(cat => {
    if (formData.type === 'income') {
      return cat.allowed_type === 'income' || cat.allowed_type === 'both'
    } else {
      return cat.allowed_type === 'outcome' || cat.allowed_type === 'both'
    }
  })

  useEffect(() => {
    // Reset category if it's not available for the selected type
    if (formData.category_id) {
      const category = categories.find(c => c.id === formData.category_id)
      if (category) {
        const isValid =
          formData.type === 'income'
            ? category.allowed_type === 'income' || category.allowed_type === 'both'
            : category.allowed_type === 'outcome' || category.allowed_type === 'both'
        
        if (!isValid) {
          setFormData(prev => ({ ...prev, category_id: '' }))
        }
      }
    }
  }, [formData.type, categories, formData.category_id])

  const validate = (field?: string) => {
    const newErrors: Record<string, string> = {}

    if (!field || field === 'amount') {
      if (!formData.amount || parseFloat(formData.amount) <= 0) {
        newErrors.amount = 'Amount must be greater than 0'
      }
    }

    if (!field || field === 'category_id') {
      if (!formData.category_id) {
        newErrors.category_id = 'Category is required'
      }
    }

    if (!field || field === 'occurred_at') {
      if (!formData.occurred_at) {
        newErrors.occurred_at = 'Date is required'
      }
    }

    if (field) {
      setErrors(prev => ({ ...prev, ...newErrors }))
    } else {
      setErrors(newErrors)
    }
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validate()) {
      return
    }

    setLoading(true)
    try {
      const transactionData: Omit<Transaction, 'id' | 'created_at' | 'account' | 'category'> = {
        type: formData.type,
        amount: parseFloat(formData.amount),
        currency: formData.currency,
        description: formData.description || null,
        occurred_at: new Date(formData.occurred_at).toISOString(),
        category_id: formData.category_id,
        account_id: formData.account_id || null,
        metadata: {},
        // user_id will be automatically set by the hook based on the logged-in user
      }

      await onSave(transactionData)
      // Form will be closed by parent component
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save transaction'
      notifications.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50 p-0 sm:p-4 animate-fadeIn">
      <div className="bg-white dark:bg-gray-800 rounded-none sm:rounded-lg shadow-xl max-w-2xl w-full h-full sm:h-auto sm:max-h-[90vh] overflow-y-auto animate-scaleIn transition-colors duration-300">
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-3 sm:py-4 flex justify-between items-center transition-colors">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white transition-colors">
            {transaction ? 'Edit Transaction' : 'Add Transaction'}
          </h2>
          <button
            onClick={onCancel}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 transition-colors">
                Type <span className="text-red-500 dark:text-red-400">*</span>
              </label>
              <select
                value={formData.type}
                onChange={(e) =>
                  setFormData({ ...formData, type: e.target.value as TransactionType })
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 transition-colors"
                required
              >
                <option value="income">Income</option>
                <option value="outcome">Outcome</option>
              </select>
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 transition-colors">
                Amount <span className="text-red-500 dark:text-red-400">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.amount}
                onChange={(e) => {
                  setFormData({ ...formData, amount: e.target.value })
                  if (errors.amount) validate('amount')
                }}
                onBlur={() => validate('amount')}
                className={`w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 transition-colors ${
                  errors.amount ? 'border-red-500 dark:border-red-600' : 'border-gray-300 dark:border-gray-600'
                }`}
                required
              />
              {errors.amount && (
                <p className="text-red-500 dark:text-red-400 text-xs mt-1 transition-colors">{errors.amount}</p>
              )}
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 transition-colors">
                Category <span className="text-red-500 dark:text-red-400">*</span>
              </label>
              <select
                value={formData.category_id}
                onChange={(e) => {
                  setFormData({ ...formData, category_id: e.target.value })
                  if (errors.category_id) validate('category_id')
                }}
                onBlur={() => validate('category_id')}
                className={`w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 transition-colors ${
                  errors.category_id ? 'border-red-500 dark:border-red-600' : 'border-gray-300 dark:border-gray-600'
                }`}
                required
              >
                <option value="">Select Category</option>
                {availableCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
              {errors.category_id && (
                <p className="text-red-500 dark:text-red-400 text-xs mt-1 transition-colors">{errors.category_id}</p>
              )}
            </div>

            {/* Account */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 transition-colors">
                Account (Optional)
              </label>
              <select
                value={formData.account_id}
                onChange={(e) =>
                  setFormData({ ...formData, account_id: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 transition-colors"
              >
                <option value="">No Account</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 transition-colors">
                Date <span className="text-red-500 dark:text-red-400">*</span>
              </label>
              <input
                type="date"
                value={formData.occurred_at}
                onChange={(e) => {
                  setFormData({ ...formData, occurred_at: e.target.value })
                  if (errors.occurred_at) validate('occurred_at')
                }}
                onBlur={() => validate('occurred_at')}
                className={`w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 transition-colors ${
                  errors.occurred_at ? 'border-red-500 dark:border-red-600' : 'border-gray-300 dark:border-gray-600'
                }`}
                required
              />
              {errors.occurred_at && (
                <p className="text-red-500 dark:text-red-400 text-xs mt-1 transition-colors">{errors.occurred_at}</p>
              )}
            </div>

            {/* Currency */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 transition-colors">
                Currency
              </label>
              <select
                value={formData.currency}
                onChange={(e) =>
                  setFormData({ ...formData, currency: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 transition-colors"
              >
                <option value="IDR">IDR (Indonesian Rupiah)</option>
                <option value="USD">USD (US Dollar)</option>
                <option value="EUR">EUR (Euro)</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 transition-colors">
              Description (Optional)
            </label>
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 transition-colors"
              placeholder="Enter transaction description..."
            />
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700 transition-colors">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="w-full px-4 py-2 bg-primary-600 dark:bg-primary-500 text-white rounded-md hover:bg-primary-700 dark:hover:bg-primary-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {transaction ? 'Updating...' : 'Adding...'}
                </>
              ) : (
                `${transaction ? 'Update' : 'Add'} Transaction`
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default TransactionForm
