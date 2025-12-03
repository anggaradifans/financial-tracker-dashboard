import type { Meta, StoryObj } from '@storybook/react'
import AuthFlow from './AuthFlow'
import { MemoryRouter } from 'react-router-dom'

const meta: Meta<typeof AuthFlow> = {
  title: 'Pages/AuthFlow',
  component: AuthFlow,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof AuthFlow>

export const Default: Story = {
  args: {},
}

export const LoginView: Story = {
  render: () => {
    // AuthFlow starts with login view by default
    return <AuthFlow />
  },
}

export const RegistrationView: Story = {
  render: () => {
    // This would require internal state manipulation, so we show the component
    // Users can interact with it to switch views
    return <AuthFlow />
  },
}

