import type { Meta, StoryObj } from '@storybook/react'
import PeriodFilter from './PeriodFilter'
import { getDateRangeForPeriod } from '../../hooks/useFinancialDataRest'

const meta: Meta<typeof PeriodFilter> = {
  title: 'Components/PeriodFilter',
  component: PeriodFilter,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    period: {
      control: 'select',
      options: ['today', 'week', 'month', 'year', 'custom'],
      description: 'Selected period',
    },
    dateRange: {
      control: false,
      description: 'Current date range',
    },
    onPeriodChange: {
      action: 'period-changed',
      description: 'Callback when period changes',
    },
    onCustomRangeChange: {
      action: 'custom-range-changed',
      description: 'Callback when custom range changes',
    },
  },
}

export default meta
type Story = StoryObj<typeof PeriodFilter>

export const Today: Story = {
  args: {
    period: 'today',
    dateRange: getDateRangeForPeriod('today'),
    onPeriodChange: () => {},
    onCustomRangeChange: () => {},
  },
}

export const ThisWeek: Story = {
  args: {
    period: 'week',
    dateRange: getDateRangeForPeriod('week'),
    onPeriodChange: () => {},
    onCustomRangeChange: () => {},
  },
}

export const ThisMonth: Story = {
  args: {
    period: 'month',
    dateRange: getDateRangeForPeriod('month'),
    onPeriodChange: () => {},
    onCustomRangeChange: () => {},
  },
}

export const ThisYear: Story = {
  args: {
    period: 'year',
    dateRange: getDateRangeForPeriod('year'),
    onPeriodChange: () => {},
    onCustomRangeChange: () => {},
  },
}

export const CustomRange: Story = {
  args: {
    period: 'custom',
    dateRange: {
      start: new Date(2024, 0, 1),
      end: new Date(2024, 11, 31),
    },
    onPeriodChange: () => {},
    onCustomRangeChange: () => {},
  },
}

