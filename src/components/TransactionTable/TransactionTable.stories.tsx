import type { Meta, StoryObj } from '@storybook/react'
import TransactionTable from './TransactionTable'
import { Transaction } from '../../types/financial'

const meta: Meta<typeof TransactionTable> = {
  title: 'Financial/TransactionTable',
  component: TransactionTable,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    transactions: {
      control: false,
      description: 'Array of transactions',
    },
    onEdit: {
      action: 'edit',
      description: 'Callback when edit is clicked',
    },
    onDelete: {
      action: 'delete',
      description: 'Callback when delete is clicked',
    },
    loading: {
      control: 'boolean',
      description: 'Loading state',
    },
    currency: {
      control: 'select',
      options: ['IDR', 'USD', 'EUR'],
      description: 'Currency code',
    },
    onAddTransaction: {
      action: 'add-transaction',
      description: 'Callback when add transaction is clicked',
    },
  },
}

export default meta
type Story = StoryObj<typeof TransactionTable>

const mockTransactions: Transaction[] = [
  {
    id: 'tx-1',
    type: 'income',
    amount: 15000000,
    currency: 'IDR',
    description: 'Monthly Salary',
    occurred_at: new Date(2024, 0, 1).toISOString(),
    created_at: new Date(2024, 0, 1).toISOString(),
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
    amount: 150000,
    currency: 'IDR',
    description: 'Lunch at restaurant',
    occurred_at: new Date(2024, 0, 2).toISOString(),
    created_at: new Date(2024, 0, 2).toISOString(),
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
    amount: 50000,
    currency: 'IDR',
    description: 'Uber ride',
    occurred_at: new Date(2024, 0, 3).toISOString(),
    created_at: new Date(2024, 0, 3).toISOString(),
    category_id: 'cat-3',
    account_id: 'acc-3',
    metadata: {},
    user_id: 'user-1',
    category: {
      id: 'cat-3',
      name: 'Transportation',
      allowed_type: 'outcome',
      created_at: new Date().toISOString(),
    },
    account: {
      id: 'acc-3',
      name: 'Credit Card',
      currency: 'IDR',
      created_at: new Date().toISOString(),
    },
  },
  {
    id: 'tx-4',
    type: 'income',
    amount: 2500000,
    currency: 'IDR',
    description: 'Freelance project payment',
    occurred_at: new Date(2024, 0, 4).toISOString(),
    created_at: new Date(2024, 0, 4).toISOString(),
    category_id: 'cat-4',
    account_id: 'acc-1',
    metadata: {},
    user_id: 'user-1',
    category: {
      id: 'cat-4',
      name: 'Freelance',
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
    id: 'tx-5',
    type: 'outcome',
    amount: 300000,
    currency: 'IDR',
    description: 'Grocery shopping',
    occurred_at: new Date(2024, 0, 5).toISOString(),
    created_at: new Date(2024, 0, 5).toISOString(),
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

export const Default: Story = {
  args: {
    transactions: mockTransactions,
    loading: false,
    currency: 'IDR',
  },
}

export const Loading: Story = {
  args: {
    transactions: [],
    loading: true,
    currency: 'IDR',
  },
}

export const Empty: Story = {
  args: {
    transactions: [],
    loading: false,
    currency: 'IDR',
    onAddTransaction: () => {},
  },
}

export const ManyTransactions: Story = {
  args: {
    transactions: Array.from({ length: 25 }, (_, i) => ({
      ...mockTransactions[i % mockTransactions.length],
      id: `tx-${i + 1}`,
      occurred_at: new Date(2024, 0, i + 1).toISOString(),
      amount: Math.floor(Math.random() * 5000000) + 50000,
    })),
    loading: false,
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
    loading: false,
    currency: 'USD',
  },
}

export const OnlyIncome: Story = {
  args: {
    transactions: mockTransactions.filter(tx => tx.type === 'income'),
    loading: false,
    currency: 'IDR',
  },
}

export const OnlyOutcome: Story = {
  args: {
    transactions: mockTransactions.filter(tx => tx.type === 'outcome'),
    loading: false,
    currency: 'IDR',
  },
}

