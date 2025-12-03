import React, { useState } from 'react'
import { Account, Category, CategoryAllowedType } from '../types/financial'
import { Plus } from 'lucide-react'
import { notifications } from '../utils/notifications'

interface CategoryAccountManagerProps {
  accounts: Account[]
  categories: Category[]
  onAddAccount: (name: string, currency: string) => Promise<void>
  onAddCategory: (name: string, allowedType: CategoryAllowedType) => Promise<void>
}

const CategoryAccountManager: React.FC<CategoryAccountManagerProps> = ({
  accounts,
  categories,
  onAddAccount,
  onAddCategory,
}) => {
  const [showAccountForm, setShowAccountForm] = useState(false)
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [accountFormData, setAccountFormData] = useState({
    name: '',
    currency: 'IDR',
  })
  const [categoryFormData, setCategoryFormData] = useState({
    name: '',
    allowed_type: 'both' as CategoryAllowedType,
  })
  const [loading, setLoading] = useState(false)

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!accountFormData.name.trim()) return

    setLoading(true)
    try {
      await onAddAccount(accountFormData.name.trim(), accountFormData.currency)
      setAccountFormData({ name: '', currency: 'IDR' })
      setShowAccountForm(false)
      notifications.success('Account added successfully')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add account'
      notifications.error(message)
    } finally {
      setLoading(false)
    }
  }

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!categoryFormData.name.trim()) return

    setLoading(true)
    try {
      await onAddCategory(categoryFormData.name.trim(), categoryFormData.allowed_type)
      setCategoryFormData({ name: '', allowed_type: 'both' })
      setShowCategoryForm(false)
      notifications.success('Category added successfully')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add category'
      notifications.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
      {/* Accounts Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 sm:p-6 border border-gray-200 dark:border-gray-700 transition-colors duration-300">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-0 mb-4">
          <h3 className="text-base sm:text-lg font-semibold text-gray-800 dark:text-white transition-colors">Accounts</h3>
          <button
            onClick={() => setShowAccountForm(!showAccountForm)}
            className="flex items-center justify-center gap-2 px-3 py-1.5 bg-primary-600 dark:bg-primary-500 text-white text-xs sm:text-sm rounded-md hover:bg-primary-700 dark:hover:bg-primary-600 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Account
          </button>
        </div>

        {showAccountForm && (
          <form onSubmit={handleAddAccount} className="mb-4 p-3 sm:p-4 bg-gray-50 dark:bg-gray-900/50 rounded-md space-y-3 transition-colors">
            <input
              type="text"
              placeholder="Account name"
              value={accountFormData.name}
              onChange={(e) =>
                setAccountFormData({ ...accountFormData, name: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 transition-colors"
              required
            />
            <select
              value={accountFormData.currency}
              onChange={(e) =>
                setAccountFormData({ ...accountFormData, currency: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 transition-colors"
            >
              <option value="IDR">IDR</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-3 py-2 bg-primary-600 dark:bg-primary-500 text-white text-sm rounded-md hover:bg-primary-700 dark:hover:bg-primary-600 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Adding...' : 'Add'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAccountForm(false)
                  setAccountFormData({ name: '', currency: 'IDR' })
                }}
                className="px-3 py-2 bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-md hover:bg-gray-400 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="space-y-2">
          {accounts.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 transition-colors">No accounts yet. Add your first account!</p>
          ) : (
            accounts.map((account) => (
              <div
                key={account.id}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <div>
                  <p className="font-medium text-gray-900 dark:text-white transition-colors">{account.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 transition-colors">{account.currency}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Categories Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 sm:p-6 border border-gray-200 dark:border-gray-700 transition-colors duration-300">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-0 mb-4">
          <h3 className="text-base sm:text-lg font-semibold text-gray-800 dark:text-white transition-colors">Categories</h3>
          <button
            onClick={() => setShowCategoryForm(!showCategoryForm)}
            className="flex items-center justify-center gap-2 px-3 py-1.5 bg-primary-600 dark:bg-primary-500 text-white text-xs sm:text-sm rounded-md hover:bg-primary-700 dark:hover:bg-primary-600 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Category
          </button>
        </div>

        {showCategoryForm && (
          <form onSubmit={handleAddCategory} className="mb-4 p-3 sm:p-4 bg-gray-50 dark:bg-gray-900/50 rounded-md space-y-3 transition-colors">
            <input
              type="text"
              placeholder="Category name"
              value={categoryFormData.name}
              onChange={(e) =>
                setCategoryFormData({ ...categoryFormData, name: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 transition-colors"
              required
            />
            <select
              value={categoryFormData.allowed_type}
              onChange={(e) =>
                setCategoryFormData({
                  ...categoryFormData,
                  allowed_type: e.target.value as CategoryAllowedType,
                })
              }
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 transition-colors"
            >
              <option value="both">Both Income & Outcome</option>
              <option value="income">Income Only</option>
              <option value="outcome">Outcome Only</option>
            </select>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-3 py-2 bg-primary-600 dark:bg-primary-500 text-white text-sm rounded-md hover:bg-primary-700 dark:hover:bg-primary-600 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Adding...' : 'Add'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCategoryForm(false)
                  setCategoryFormData({ name: '', allowed_type: 'both' })
                }}
                className="px-3 py-2 bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-md hover:bg-gray-400 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="space-y-2">
          {categories.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 transition-colors">No categories yet. Add your first category!</p>
          ) : (
            categories.map((category) => (
              <div
                key={category.id}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <div>
                  <p className="font-medium text-gray-900 dark:text-white transition-colors">{category.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 capitalize transition-colors">
                    {category.allowed_type === 'both'
                      ? 'Income & Outcome'
                      : category.allowed_type}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default CategoryAccountManager
