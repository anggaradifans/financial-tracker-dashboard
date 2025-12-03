import React, { useState } from 'react'
import { Budget, Category } from '../../types/financial'
import { Plus, Trash2, Edit2 } from 'lucide-react'
import { notifications } from '../../utils/notifications'
import ConfirmDialog from '../ConfirmDialog'

interface BudgetManagerProps {
  budgets: Budget[]
  categories: Category[]
  onAddBudget: (budget: Omit<Budget, 'id' | 'created_at' | 'category'>) => Promise<void>
  onUpdateBudget: (id: string, updates: Partial<Budget>) => Promise<void>
  onDeleteBudget: (id: string) => Promise<void>
  currency?: string
}

const BudgetManager: React.FC<BudgetManagerProps> = ({
  budgets,
  categories,
  onAddBudget,
  onUpdateBudget,
  onDeleteBudget,
  currency = 'IDR',
}) => {
  const [showForm, setShowForm] = useState(false)
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null)
  const [formData, setFormData] = useState({
    category_id: '',
    amount: '',
    period: 'monthly' as 'daily' | 'weekly' | 'monthly' | 'yearly',
    start_date: new Date().toISOString().split('T')[0],
  })

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const budgetData = {
        category_id: formData.category_id,
        amount: Number(formData.amount),
        currency,
        period: formData.period,
        start_date: new Date(formData.start_date).toISOString(),
        end_date: null,
      }

      if (editingBudget) {
        await onUpdateBudget(editingBudget.id, budgetData)
      } else {
        await onAddBudget(budgetData)
      }

      setShowForm(false)
      setEditingBudget(null)
      setFormData({
        category_id: '',
        amount: '',
        period: 'monthly',
        start_date: new Date().toISOString().split('T')[0],
      })
      notifications.success(editingBudget ? 'Budget updated successfully' : 'Budget created successfully')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save budget'
      notifications.error(message)
    }
  }

  const handleEdit = (budget: Budget) => {
    setEditingBudget(budget)
    setFormData({
      category_id: budget.category_id,
      amount: budget.amount.toString(),
      period: budget.period,
      start_date: budget.start_date.split('T')[0],
    })
    setShowForm(true)
  }

  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null)

  const handleDeleteClick = (budget: Budget) => {
    const categoryName = (budget as any).category?.name || categories.find(c => c.id === budget.category_id)?.name || 'this budget'
    setDeleteConfirm({
      id: budget.id,
      name: categoryName,
    })
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    try {
      await onDeleteBudget(deleteConfirm.id)
      notifications.success('Budget deleted successfully')
      setDeleteConfirm(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete budget'
      notifications.error(message)
    }
  }

  const outcomeCategories = categories.filter(
    cat => cat.allowed_type === 'outcome' || cat.allowed_type === 'both'
  )

  return (
    <>
      <ConfirmDialog
        isOpen={!!deleteConfirm}
        title="Delete Budget"
        message={`Are you sure you want to delete the budget for "${deleteConfirm?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(null)}
        variant="danger"
      />
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 sm:p-6 border border-gray-200 dark:border-gray-700 transition-colors duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 mb-4 sm:mb-6">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white transition-colors">Budget Management</h2>
        <button
          onClick={() => {
            setShowForm(!showForm)
            setEditingBudget(null)
            setFormData({
              category_id: '',
              amount: '',
              period: 'monthly',
              start_date: new Date().toISOString().split('T')[0],
            })
          }}
          className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 text-sm sm:text-base bg-primary-600 dark:bg-primary-500 text-white rounded-md hover:bg-primary-700 dark:hover:bg-primary-600 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Budget
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-4 sm:mb-6 p-3 sm:p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700 transition-colors">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 transition-colors">
                Category *
              </label>
              <select
                value={formData.category_id}
                onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 transition-colors"
                required
              >
                <option value="">Select a category</option>
                {outcomeCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 transition-colors">
                Amount *
              </label>
              <input
                type="number"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 transition-colors"
                placeholder="0"
                min="0"
                step="0.01"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 transition-colors">
                Period *
              </label>
              <select
                value={formData.period}
                onChange={(e) => setFormData({ ...formData, period: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 transition-colors"
                required
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 transition-colors">
                Start Date *
              </label>
              <input
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 transition-colors"
                required
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2 mt-3 sm:mt-4">
            <button
              type="submit"
              className="flex-1 sm:flex-none px-4 py-2 text-sm sm:text-base bg-primary-600 dark:bg-primary-500 text-white rounded-md hover:bg-primary-700 dark:hover:bg-primary-600 transition-colors"
            >
              {editingBudget ? 'Update' : 'Add'} Budget
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false)
                setEditingBudget(null)
              }}
              className="flex-1 sm:flex-none px-4 py-2 text-sm sm:text-base bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {budgets.length === 0 ? (
          <p className="text-center text-gray-500 dark:text-gray-400 py-8 transition-colors">No budgets set. Add your first budget!</p>
        ) : (
          budgets.map((budget) => (
            <div
              key={budget.id}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 p-3 sm:p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white transition-colors truncate">
                    {budget.categories?.name || 'Unknown Category'}
                  </h3>
                  <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded capitalize transition-colors">
                    {budget.period}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 transition-colors">
                  {formatCurrency(budget.amount)}
                  {' · '}
                  Started: {new Date(budget.start_date).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <button
                  onClick={() => handleEdit(budget)}
                  className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-md transition-colors"
                  title="Edit budget"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDeleteClick(budget)}
                  className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors"
                  title="Delete budget"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      </div>
    </>
  )
}

export default BudgetManager

