import type { Meta, StoryObj } from '@storybook/react'
import DemoDashboard from './DemoDashboard'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from '../../contexts/ThemeContext'

const meta: Meta<typeof DemoDashboard> = {
  title: 'Pages/DemoDashboard',
  component: DemoDashboard,
  decorators: [
    (Story) => (
      <BrowserRouter>
        <ThemeProvider>
          <Story />
        </ThemeProvider>
      </BrowserRouter>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof DemoDashboard>

export const Default: Story = {
  args: {},
  parameters: {
    docs: {
      description: {
        story: 'Demo Dashboard shows mock financial data without requiring authentication. Perfect for demonstrating the application to clients.',
      },
    },
  },
}

export const WithMockData: Story = {
  parameters: {
    docs: {
      description: {
        story: 'Demo Dashboard uses mock data from useDemoFinancialData hook to display sample transactions, budgets, and insights.',
      },
    },
  },
}

export const Interactive: Story = {
  parameters: {
    docs: {
      description: {
        story: 'All features are interactive in demo mode, but changes are not persisted. Users can explore the full functionality.',
      },
    },
  },
}

