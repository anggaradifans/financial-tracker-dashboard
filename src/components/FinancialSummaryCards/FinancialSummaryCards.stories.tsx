import type { Meta, StoryObj } from '@storybook/react'
import FinancialSummaryCards from './FinancialSummaryCards'
import { FinancialSummary } from '../../types/financial'

const meta: Meta<typeof FinancialSummaryCards> = {
  title: 'Financial/SummaryCards',
  component: FinancialSummaryCards,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    summary: {
      control: 'object',
      description: 'Financial summary data',
    },
    currency: {
      control: 'select',
      options: ['IDR', 'USD', 'EUR'],
      description: 'Currency code',
    },
    showAmounts: {
      control: 'boolean',
      description: 'Whether to show actual amounts or masked values',
    },
    onToggleAmounts: {
      action: 'toggle-amounts',
      description: 'Callback when toggle amounts button is clicked',
    },
  },
}

export default meta
type Story = StoryObj<typeof FinancialSummaryCards>

const positiveSummary: FinancialSummary = {
  totalIncome: 15000000,
  totalOutcome: 8500000,
  netBalance: 6500000,
  accountBalance: 12000000,
}

const negativeSummary: FinancialSummary = {
  totalIncome: 5000000,
  totalOutcome: 7500000,
  netBalance: -2500000,
  accountBalance: 3000000,
}

const balancedSummary: FinancialSummary = {
  totalIncome: 10000000,
  totalOutcome: 10000000,
  netBalance: 0,
  accountBalance: 5000000,
}

export const PositiveBalance: Story = {
  args: {
    summary: positiveSummary,
    currency: 'IDR',
    showAmounts: true,
  },
}

export const NegativeBalance: Story = {
  args: {
    summary: negativeSummary,
    currency: 'IDR',
    showAmounts: true,
  },
}

export const Balanced: Story = {
  args: {
    summary: balancedSummary,
    currency: 'IDR',
    showAmounts: true,
  },
}

export const AmountsHidden: Story = {
  args: {
    summary: positiveSummary,
    currency: 'IDR',
    showAmounts: false,
    onToggleAmounts: () => alert('Toggle amounts clicked!'),
  },
}

export const USDCurrency: Story = {
  args: {
    summary: {
      totalIncome: 5000,
      totalOutcome: 3000,
      netBalance: 2000,
      accountBalance: 10000,
    },
    currency: 'USD',
    showAmounts: true,
  },
}

