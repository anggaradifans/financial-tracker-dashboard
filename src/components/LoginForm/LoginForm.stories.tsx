import type { Meta, StoryObj } from '@storybook/react'
import LoginForm from './LoginForm'
import { MemoryRouter } from 'react-router-dom'

const meta: Meta<typeof LoginForm> = {
  title: 'Forms/LoginForm',
  component: LoginForm,
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
    onSwitchToRegister: {
      action: 'switch-to-register',
      description: 'Callback when switching to registration',
    },
  },
}

export default meta
type Story = StoryObj<typeof LoginForm>

export const Default: Story = {
  args: {
    onSwitchToRegister: () => {},
  },
}

export const WithError: Story = {
  args: {
    onSwitchToRegister: () => {},
  },
  render: (args) => {
    // Note: In real usage, errors come from form state
    // This is just for visual demonstration
    return (
      <div>
        <LoginForm {...args} />
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
          Note: Error states are handled internally by the component. This is a visual example.
        </div>
      </div>
    )
  },
}

