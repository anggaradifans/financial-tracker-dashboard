import type { Meta, StoryObj } from '@storybook/react'
import EmptyState from './EmptyState'
import { TrendingUp, Inbox, AlertCircle } from 'lucide-react'

const meta: Meta<typeof EmptyState> = {
  title: 'Components/EmptyState',
  component: EmptyState,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    icon: {
      control: false,
      description: 'Lucide icon component',
    },
    title: {
      control: 'text',
      description: 'Main title text',
    },
    description: {
      control: 'text',
      description: 'Optional description text',
    },
    action: {
      control: false,
      description: 'Optional action button',
    },
  },
}

export default meta
type Story = StoryObj<typeof EmptyState>

export const Default: Story = {
  args: {
    icon: Inbox,
    title: 'No items found',
    description: 'There are no items to display at this time.',
  },
}

export const WithAction: Story = {
  args: {
    icon: TrendingUp,
    title: 'No financial data yet',
    description: 'Start by adding your first transaction to see charts and insights',
    action: {
      label: 'Add Transaction',
      onClick: () => alert('Add transaction clicked!'),
    },
  },
}

export const WithAlertIcon: Story = {
  args: {
    icon: AlertCircle,
    title: 'Something went wrong',
    description: 'We encountered an error while loading your data. Please try again.',
    action: {
      label: 'Retry',
      onClick: () => alert('Retry clicked!'),
    },
  },
}

export const Minimal: Story = {
  args: {
    icon: Inbox,
    title: 'Empty',
  },
}

