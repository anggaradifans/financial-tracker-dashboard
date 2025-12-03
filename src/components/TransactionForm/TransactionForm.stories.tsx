import type { Meta, StoryObj } from '@storybook/react'
import TransactionForm from './TransactionForm'
import { Account, Category } from '../../types/financial'

const meta: Meta<typeof TransactionForm> = {
  title: 'Forms/TransactionForm',
  component: TransactionForm,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  argTypes: {
    transaction: {
      control: false,
      description: 'Existing transaction to edit (null for new transaction)',
    },
    accounts: {
      control: false,
      description: 'List of available accounts',
    },
    categories: {
      control: false,
      description: 'List of available categories',
    },
    onSave: {
      action: 'save',
      description: 'Callback when form is submitted',
    },
    onCancel: {
      action: 'cancel',
      description: 'Callback when form is cancelled',
    },
    currency: {
      control: 'select',
      options: ['IDR', 'USD', 'EUR'],
      description: 'Default currency',
    },
  },
}

export default meta
type Story = StoryObj<typeof TransactionForm>

const mockAccounts: Account[] = [
  {
    id: 'acc-1',
    name: 'Cash',
    currency: 'IDR',
    created_at: new Date().toISOString(),
  },
  {
    id: 'acc-2',
    name: 'Bank Account',
    currency: 'IDR',
    created_at: new Date().toISOString(),
  },
  {
    id: 'acc-3',
    name: 'Credit Card',
    currency: 'IDR',
    created_at: new Date().toISOString(),
  },
]

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
    name: 'Salary',
    allowed_type: 'income',
    created_at: new Date().toISOString(),
  },
  {
    id: 'cat-5',
    name: 'Freelance',
    allowed_type: 'income',
    created_at: new Date().toISOString(),
  },
  {
    id: 'cat-6',
    name: 'Both Types',
    allowed_type: 'both',
    created_at: new Date().toISOString(),
  },
]

export const NewTransaction: Story = {
  args: {
    transaction: null,
    accounts: mockAccounts,
    categories: mockCategories,
    currency: 'IDR',
    onSave: async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    },
    onCancel: () => {},
  },
}

export const EditTransaction: Story = {
  args: {
    transaction: {
      id: 'tx-1',
      type: 'outcome',
      amount: 150000,
      currency: 'IDR',
      description: 'Lunch at restaurant',
      occurred_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      category_id: 'cat-1',
      account_id: 'acc-1',
      metadata: {},
      user_id: 'user-1',
    },
    accounts: mockAccounts,
    categories: mockCategories,
    currency: 'IDR',
    onSave: async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    },
    onCancel: () => {},
  },
}

export const IncomeTransaction: Story = {
  args: {
    transaction: null,
    accounts: mockAccounts,
    categories: mockCategories.filter((cat) => cat.allowed_type === 'income' || cat.allowed_type === 'both'),
    currency: 'IDR',
    onSave: async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    },
    onCancel: () => {},
  },
}

export const USDCurrency: Story = {
  args: {
    transaction: null,
    accounts: mockAccounts,
    categories: mockCategories,
    currency: 'USD',
    onSave: async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    },
    onCancel: () => {},
  },
}

