import type { Meta, StoryObj } from '@storybook/react'
import BudgetManager from './BudgetManager'
import { Budget, Category } from '../../types/financial'

const meta: Meta<typeof BudgetManager> = {
  title: 'Financial/BudgetManager',
  component: BudgetManager,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    budgets: {
      control: false,
      description: 'Array of budgets',
    },
    categories: {
      control: false,
      description: 'Array of categories',
    },
    onAddBudget: {
      action: 'add-budget',
      description: 'Callback when budget is added',
    },
    onUpdateBudget: {
      action: 'update-budget',
      description: 'Callback when budget is updated',
    },
    onDeleteBudget: {
      action: 'delete-budget',
      description: 'Callback when budget is deleted',
    },
    currency: {
      control: 'select',
      options: ['IDR', 'USD', 'EUR'],
      description: 'Currency code',
    },
  },
}

export default meta
type Story = StoryObj<typeof BudgetManager>

const mockCategories: Category[] = [
  {
    id: 'cat-1',
    name: 'Food & Dining',
    allowed_type: 'outcome',
    created_at: new Date().toISOString(),
  },
  {
    id: 'cat-2',
    name: 'Transportation',
    allowed_type: 'outcome',
    created_at: new Date().toISOString(),
  },
  {
    id: 'cat-3',
    name: 'Shopping',
    allowed_type: 'outcome',
    created_at: new Date().toISOString(),
  },
  {
    id: 'cat-4',
    name: 'Bills & Utilities',
    allowed_type: 'outcome',
    created_at: new Date().toISOString(),
  },
]

const mockBudgets: Budget[] = [
  {
    id: 'budget-1',
    category_id: 'cat-1',
    amount: 2000000,
    currency: 'IDR',
    period: 'monthly',
    start_date: new Date().toISOString(),
    created_at: new Date().toISOString(),
    user_id: 'user-1',
    categories: mockCategories[0],
  },
  {
    id: 'budget-2',
    category_id: 'cat-2',
    amount: 1000000,
    currency: 'IDR',
    period: 'weekly',
    start_date: new Date().toISOString(),
    created_at: new Date().toISOString(),
    user_id: 'user-1',
    categories: mockCategories[1],
  },
]

export const Default: Story = {
  args: {
    budgets: mockBudgets,
    categories: mockCategories,
    currency: 'IDR',
    onAddBudget: async () => {
      await new Promise((resolve) => setTimeout(resolve, 500))
    },
    onUpdateBudget: async () => {
      await new Promise((resolve) => setTimeout(resolve, 500))
    },
    onDeleteBudget: async () => {
      await new Promise((resolve) => setTimeout(resolve, 500))
    },
  },
}

export const Empty: Story = {
  args: {
    budgets: [],
    categories: mockCategories,
    currency: 'IDR',
    onAddBudget: async () => {
      await new Promise((resolve) => setTimeout(resolve, 500))
    },
    onUpdateBudget: async () => {
      await new Promise((resolve) => setTimeout(resolve, 500))
    },
    onDeleteBudget: async () => {
      await new Promise((resolve) => setTimeout(resolve, 500))
    },
  },
}

export const ManyBudgets: Story = {
  args: {
    budgets: Array.from({ length: 8 }, (_, i) => ({
      id: `budget-${i + 1}`,
      category_id: mockCategories[i % mockCategories.length].id,
      amount: (i + 1) * 500000,
      currency: 'IDR',
      period: ['daily', 'weekly', 'monthly', 'yearly'][i % 4] as 'daily' | 'weekly' | 'monthly' | 'yearly',
      start_date: new Date().toISOString(),
      created_at: new Date().toISOString(),
      user_id: 'user-1',
      categories: mockCategories[i % mockCategories.length],
    })),
    categories: mockCategories,
    currency: 'IDR',
    onAddBudget: async () => {
      await new Promise((resolve) => setTimeout(resolve, 500))
    },
    onUpdateBudget: async () => {
      await new Promise((resolve) => setTimeout(resolve, 500))
    },
    onDeleteBudget: async () => {
      await new Promise((resolve) => setTimeout(resolve, 500))
    },
  },
}

export const USDCurrency: Story = {
  args: {
    budgets: [
      {
        ...mockBudgets[0],
        currency: 'USD',
        amount: 500,
      },
    ],
    categories: mockCategories,
    currency: 'USD',
    onAddBudget: async () => {
      await new Promise((resolve) => setTimeout(resolve, 500))
    },
    onUpdateBudget: async () => {
      await new Promise((resolve) => setTimeout(resolve, 500))
    },
    onDeleteBudget: async () => {
      await new Promise((resolve) => setTimeout(resolve, 500))
    },
  },
}

