import type { Meta, StoryObj } from '@storybook/react'
import RegistrationForm from './RegistrationForm'
import { MemoryRouter } from 'react-router-dom'

const meta: Meta<typeof RegistrationForm> = {
  title: 'Forms/RegistrationForm',
  component: RegistrationForm,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    onSwitchToLogin: {
      action: 'switch-to-login',
      description: 'Callback when switching to login',
    },
  },
}

export default meta
type Story = StoryObj<typeof RegistrationForm>

export const Default: Story = {
  args: {
    onSwitchToLogin: () => {},
  },
}

export const WithSwitchToLogin: Story = {
  args: {
    onSwitchToLogin: () => alert('Switch to login clicked!'),
  },
}

