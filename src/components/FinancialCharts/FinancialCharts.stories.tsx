import type { Meta, StoryObj } from '@storybook/react'
import FinancialCharts from './FinancialCharts'
import { TimeSeriesData, CategoryBreakdown } from '../../types/financial'

const meta: Meta<typeof FinancialCharts> = {
  title: 'Financial/Charts',
  component: FinancialCharts,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    timeSeriesData: {
      control: false,
      description: 'Time series data for line chart',
    },
    categoryBreakdown: {
      control: false,
      description: 'Category breakdown data for pie chart',
    },
    currency: {
      control: 'select',
      options: ['IDR', 'USD', 'EUR'],
      description: 'Currency code',
    },
  },
}

export default meta
type Story = StoryObj<typeof FinancialCharts>

const mockTimeSeriesData: TimeSeriesData[] = [
  { date: '2024-01-01', income: 5000000, outcome: 2000000, net: 3000000 },
  { date: '2024-01-02', income: 0, outcome: 1500000, net: -1500000 },
  { date: '2024-01-03', income: 0, outcome: 3000000, net: -3000000 },
  { date: '2024-01-04', income: 2500000, outcome: 1000000, net: 1500000 },
  { date: '2024-01-05', income: 0, outcome: 2000000, net: -2000000 },
  { date: '2024-01-06', income: 0, outcome: 500000, net: -500000 },
  { date: '2024-01-07', income: 0, outcome: 1000000, net: -1000000 },
]

const mockCategoryBreakdown: CategoryBreakdown[] = [
  { category_id: 'cat-1', category_name: 'Food & Dining', amount: 2500000, count: 15, type: 'outcome' },
  { category_id: 'cat-2', category_name: 'Transportation', amount: 1500000, count: 8, type: 'outcome' },
  { category_id: 'cat-3', category_name: 'Shopping', amount: 3000000, count: 5, type: 'outcome' },
  { category_id: 'cat-4', category_name: 'Bills & Utilities', amount: 2000000, count: 3, type: 'outcome' },
  { category_id: 'cat-5', category_name: 'Entertainment', amount: 1000000, count: 4, type: 'outcome' },
]

export const Default: Story = {
  args: {
    timeSeriesData: mockTimeSeriesData,
    categoryBreakdown: mockCategoryBreakdown,
    currency: 'IDR',
  },
}

export const SingleDay: Story = {
  args: {
    timeSeriesData: [mockTimeSeriesData[0]],
    categoryBreakdown: mockCategoryBreakdown,
    currency: 'IDR',
  },
}

export const ManyDays: Story = {
  args: {
    timeSeriesData: Array.from({ length: 30 }, (_, i) => ({
      date: `2024-01-${String(i + 1).padStart(2, '0')}`,
      income: Math.random() * 5000000,
      outcome: Math.random() * 3000000,
      net: Math.random() * 2000000 - 1000000,
    })),
    categoryBreakdown: mockCategoryBreakdown,
    currency: 'IDR',
  },
}

export const NoData: Story = {
  args: {
    timeSeriesData: [],
    categoryBreakdown: [],
    currency: 'IDR',
  },
}

export const OnlyIncome: Story = {
  args: {
    timeSeriesData: mockTimeSeriesData.map(item => ({ ...item, outcome: 0, net: item.income })),
    categoryBreakdown: [],
    currency: 'IDR',
  },
}

export const USDCurrency: Story = {
  args: {
    timeSeriesData: mockTimeSeriesData.map(item => ({
      ...item,
      income: item.income / 15000,
      outcome: item.outcome / 15000,
      net: item.net / 15000,
    })),
    categoryBreakdown: mockCategoryBreakdown.map(item => ({
      ...item,
      amount: item.amount / 15000,
    })),
    currency: 'USD',
  },
}

