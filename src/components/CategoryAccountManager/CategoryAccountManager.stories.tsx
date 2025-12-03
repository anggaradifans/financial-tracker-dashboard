import type { Meta, StoryObj } from '@storybook/react'
import CategoryAccountManager from './CategoryAccountManager'
import { Account, Category } from '../../types/financial'

const meta: Meta<typeof CategoryAccountManager> = {
  title: 'Financial/CategoryAccountManager',
  component: CategoryAccountManager,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    accounts: {
      control: false,
      description: 'Array of accounts',
    },
    categories: {
      control: false,
      description: 'Array of categories',
    },
    onAddAccount: {
      action: 'add-account',
      description: 'Callback when account is added',
    },
    onAddCategory: {
      action: 'add-category',
      description: 'Callback when category is added',
    },
  },
}

export default meta
type Story = StoryObj<typeof CategoryAccountManager>

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
    name: 'Salary',
    allowed_type: 'income',
    created_at: new Date().toISOString(),
  },
  {
    id: 'cat-4',
    name: 'Shopping',
    allowed_type: 'both',
    created_at: new Date().toISOString(),
  },
]

export const Default: Story = {
  args: {
    accounts: mockAccounts,
    categories: mockCategories,
    onAddAccount: async () => {
      await new Promise((resolve) => setTimeout(resolve, 500))
    },
    onAddCategory: async () => {
      await new Promise((resolve) => setTimeout(resolve, 500))
    },
  },
}

export const Empty: Story = {
  args: {
    accounts: [],
    categories: [],
    onAddAccount: async () => {
      await new Promise((resolve) => setTimeout(resolve, 500))
    },
    onAddCategory: async () => {
      await new Promise((resolve) => setTimeout(resolve, 500))
    },
  },
}

export const ManyItems: Story = {
  args: {
    accounts: Array.from({ length: 10 }, (_, i) => ({
      id: `acc-${i + 1}`,
      name: `Account ${i + 1}`,
      currency: ['IDR', 'USD', 'EUR'][i % 3],
      created_at: new Date().toISOString(),
    })),
    categories: Array.from({ length: 15 }, (_, i) => ({
      id: `cat-${i + 1}`,
      name: `Category ${i + 1}`,
      allowed_type: ['income', 'outcome', 'both'][i % 3] as 'income' | 'outcome' | 'both',
      created_at: new Date().toISOString(),
    })),
    onAddAccount: async () => {
      await new Promise((resolve) => setTimeout(resolve, 500))
    },
    onAddCategory: async () => {
      await new Promise((resolve) => setTimeout(resolve, 500))
    },
  },
}

export const OnlyAccounts: Story = {
  args: {
    accounts: mockAccounts,
    categories: [],
    onAddAccount: async () => {
      await new Promise((resolve) => setTimeout(resolve, 500))
    },
    onAddCategory: async () => {
      await new Promise((resolve) => setTimeout(resolve, 500))
    },
  },
}

export const OnlyCategories: Story = {
  args: {
    accounts: [],
    categories: mockCategories,
    onAddAccount: async () => {
      await new Promise((resolve) => setTimeout(resolve, 500))
    },
    onAddCategory: async () => {
      await new Promise((resolve) => setTimeout(resolve, 500))
    },
  },
}

