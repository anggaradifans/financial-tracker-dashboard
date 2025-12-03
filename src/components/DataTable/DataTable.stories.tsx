import type { Meta, StoryObj } from '@storybook/react'
import DataTable from './DataTable'

const meta: Meta<typeof DataTable> = {
  title: 'Pages/DataTable',
  component: DataTable,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    user: {
      control: false,
      description: 'User object',
    },
  },
}

export default meta
type Story = StoryObj<typeof DataTable>

const mockUser = {
  id: 'user-123',
  email: 'user@example.com',
}

export const Default: Story = {
  args: {
    user: mockUser,
  },
  parameters: {
    docs: {
      description: {
        story: 'Note: This component requires Supabase connection. In Storybook, it will show loading state or empty state.',
      },
    },
  },
}

export const WithMockUser: Story = {
  args: {
    user: {
      id: 'demo-user-123',
      email: 'demo@example.com',
      user_metadata: {
        first_name: 'Demo',
        last_name: 'User',
      },
    },
  },
}

