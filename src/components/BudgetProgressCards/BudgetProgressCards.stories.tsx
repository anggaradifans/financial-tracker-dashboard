import type { Meta, StoryObj } from '@storybook/react'
import BudgetProgressCards from './BudgetProgressCards'
import { BudgetProgress } from '../../types/financial'

const meta: Meta<typeof BudgetProgressCards> = {
  title: 'Financial/BudgetProgressCards',
  component: BudgetProgressCards,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    budgetProgress: {
      control: false,
      description: 'Array of budget progress data',
    },
    currency: {
      control: 'select',
      options: ['IDR', 'USD', 'EUR'],
      description: 'Currency code',
    },
    onShowBudgets: {
      action: 'show-budgets',
      description: 'Callback when manage budgets button is clicked',
    },
    showBudgets: {
      control: 'boolean',
      description: 'Whether budgets panel is shown',
    },
  },
}

export default meta
type Story = StoryObj<typeof BudgetProgressCards>

const mockBudgetProgress: BudgetProgress[] = [
  {
    budget: {
      id: 'budget-1',
      category_id: 'cat-1',
      amount: 2000000,
      currency: 'IDR',
      period: 'monthly',
      start_date: new Date().toISOString(),
      created_at: new Date().toISOString(),
      user_id: 'user-1',
      categories: {
        id: 'cat-1',
        name: 'Food & Dining',
        allowed_type: 'outcome',
        created_at: new Date().toISOString(),
      },
    },
    spent: 1500000,
    remaining: 500000,
    percentage: 75,
    isOverBudget: false,
  },
  {
    budget: {
      id: 'budget-2',
      category_id: 'cat-2',
      amount: 1000000,
      currency: 'IDR',
      period: 'monthly',
      start_date: new Date().toISOString(),
      created_at: new Date().toISOString(),
      user_id: 'user-1',
      categories: {
        id: 'cat-2',
        name: 'Transportation',
        allowed_type: 'outcome',
        created_at: new Date().toISOString(),
      },
    },
    spent: 1100000,
    remaining: -100000,
    percentage: 110,
    isOverBudget: true,
  },
  {
    budget: {
      id: 'budget-3',
      category_id: 'cat-3',
      amount: 500000,
      currency: 'IDR',
      period: 'monthly',
      start_date: new Date().toISOString(),
      created_at: new Date().toISOString(),
      user_id: 'user-1',
      categories: {
        id: 'cat-3',
        name: 'Entertainment',
        allowed_type: 'outcome',
        created_at: new Date().toISOString(),
      },
    },
    spent: 400000,
    remaining: 100000,
    percentage: 80,
    isOverBudget: false,
  },
]

export const Default: Story = {
  args: {
    budgetProgress: mockBudgetProgress,
    currency: 'IDR',
  },
}

export const SingleBudget: Story = {
  args: {
    budgetProgress: [mockBudgetProgress[0]],
    currency: 'IDR',
  },
}

export const OverBudget: Story = {
  args: {
    budgetProgress: [mockBudgetProgress[1]],
    currency: 'IDR',
  },
}

export const WithManageButton: Story = {
  args: {
    budgetProgress: mockBudgetProgress,
    currency: 'IDR',
    showBudgets: false,
    onShowBudgets: () => {},
  },
}

export const EmptyState: Story = {
  args: {
    budgetProgress: [],
    currency: 'IDR',
    onShowBudgets: () => {},
    showBudgets: false,
  },
}

export const USDCurrency: Story = {
  args: {
    budgetProgress: [
      {
        ...mockBudgetProgress[0],
        budget: {
          ...mockBudgetProgress[0].budget,
          currency: 'USD',
          amount: 500,
        },
        spent: 375,
        remaining: 125,
      },
    ],
    currency: 'USD',
  },
}

