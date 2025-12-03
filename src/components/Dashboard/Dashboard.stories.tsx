import type { Meta, StoryObj } from '@storybook/react'
import Dashboard from './Dashboard'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '../../contexts/AuthContext'
import { ThemeProvider } from '../../contexts/ThemeContext'

const meta: Meta<typeof Dashboard> = {
  title: 'Pages/Dashboard',
  component: Dashboard,
  decorators: [
    (Story) => (
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <Story />
          </AuthProvider>
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
type Story = StoryObj<typeof Dashboard>

export const Default: Story = {
  args: {},
  parameters: {
    docs: {
      description: {
        story: 'Note: Dashboard requires authenticated user and Supabase connection. In Storybook, it will show loading state or require authentication.',
      },
    },
  },
}

export const LoadingState: Story = {
  parameters: {
    docs: {
      description: {
        story: 'Dashboard shows loading skeletons while fetching data.',
      },
    },
  },
}

export const WithData: Story = {
  parameters: {
    docs: {
      description: {
        story: 'Dashboard displays financial data when user is authenticated and data is available.',
      },
    },
  },
}

