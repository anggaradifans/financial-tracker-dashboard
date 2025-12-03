import type { Meta, StoryObj } from '@storybook/react'
import InsightsSection from './InsightsSection'
import { Transaction, CategoryBreakdown } from '../../types/financial'

const meta: Meta<typeof InsightsSection> = {
  title: 'Financial/InsightsSection',
  component: InsightsSection,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    transactions: {
      control: false,
      description: 'Array of transactions',
    },
    categoryBreakdown: {
      control: false,
      description: 'Category breakdown data',
    },
    dateRange: {
      control: false,
      description: 'Optional date range filter',
    },
    currency: {
      control: 'select',
      options: ['IDR', 'USD', 'EUR'],
      description: 'Currency code',
    },
  },
}

export default meta
type Story = StoryObj<typeof InsightsSection>

const mockTransactions: Transaction[] = [
  {
    id: 'tx-1',
    type: 'income',
    amount: 15000000,
    currency: 'IDR',
    description: 'Monthly Salary',
    occurred_at: new Date(2024, 0, 1).toISOString(),
    created_at: new Date().toISOString(),
    category_id: 'cat-1',
    account_id: 'acc-1',
    metadata: {},
    user_id: 'user-1',
    category: {
      id: 'cat-1',
      name: 'Salary',
      allowed_type: 'income',
      created_at: new Date().toISOString(),
    },
    account: {
      id: 'acc-1',
      name: 'Bank Account',
      currency: 'IDR',
      created_at: new Date().toISOString(),
    },
  },
  {
    id: 'tx-2',
    type: 'outcome',
    amount: 500000,
    currency: 'IDR',
    description: 'Grocery shopping',
    occurred_at: new Date(2024, 0, 2).toISOString(),
    created_at: new Date().toISOString(),
    category_id: 'cat-2',
    account_id: 'acc-2',
    metadata: {},
    user_id: 'user-1',
    category: {
      id: 'cat-2',
      name: 'Food & Dining',
      allowed_type: 'outcome',
      created_at: new Date().toISOString(),
    },
    account: {
      id: 'acc-2',
      name: 'Cash',
      currency: 'IDR',
      created_at: new Date().toISOString(),
    },
  },
  {
    id: 'tx-3',
    type: 'outcome',
    amount: 300000,
    currency: 'IDR',
    description: 'Restaurant dinner',
    occurred_at: new Date(2024, 0, 3).toISOString(),
    created_at: new Date().toISOString(),
    category_id: 'cat-2',
    account_id: 'acc-2',
    metadata: {},
    user_id: 'user-1',
    category: {
      id: 'cat-2',
      name: 'Food & Dining',
      allowed_type: 'outcome',
      created_at: new Date().toISOString(),
    },
    account: {
      id: 'acc-2',
      name: 'Cash',
      currency: 'IDR',
      created_at: new Date().toISOString(),
    },
  },
]

const mockCategoryBreakdown: CategoryBreakdown[] = [
  {
    category_id: 'cat-1',
    category_name: 'Salary',
    amount: 15000000,
    count: 1,
    type: 'income',
  },
  {
    category_id: 'cat-2',
    category_name: 'Food & Dining',
    amount: 800000,
    count: 2,
    type: 'outcome',
  },
  {
    category_id: 'cat-3',
    category_name: 'Transportation',
    amount: 500000,
    count: 3,
    type: 'outcome',
  },
]

export const Default: Story = {
  args: {
    transactions: mockTransactions,
    categoryBreakdown: mockCategoryBreakdown,
    currency: 'IDR',
  },
}

export const WithDateRange: Story = {
  args: {
    transactions: mockTransactions,
    categoryBreakdown: mockCategoryBreakdown,
    dateRange: {
      start: new Date(2024, 0, 1),
      end: new Date(2024, 0, 31),
    },
    currency: 'IDR',
  },
}

export const Empty: Story = {
  args: {
    transactions: [],
    categoryBreakdown: [],
    currency: 'IDR',
  },
}

export const ManyTransactions: Story = {
  args: {
    transactions: Array.from({ length: 50 }, (_, i) => ({
      ...mockTransactions[i % mockTransactions.length],
      id: `tx-${i + 1}`,
      amount: Math.floor(Math.random() * 5000000) + 50000,
      occurred_at: new Date(2024, 0, i + 1).toISOString(),
    })),
    categoryBreakdown: Array.from({ length: 10 }, (_, i) => ({
      category_id: `cat-${i + 1}`,
      category_name: `Category ${i + 1}`,
      amount: Math.floor(Math.random() * 5000000) + 100000,
      count: Math.floor(Math.random() * 20) + 1,
      type: i % 2 === 0 ? 'income' : 'outcome',
    })),
    currency: 'IDR',
  },
}

export const USDCurrency: Story = {
  args: {
    transactions: mockTransactions.map(tx => ({
      ...tx,
      currency: 'USD',
      amount: tx.amount / 15000,
    })),
    categoryBreakdown: mockCategoryBreakdown.map(cat => ({
      ...cat,
      amount: cat.amount / 15000,
    })),
    currency: 'USD',
  },
}

