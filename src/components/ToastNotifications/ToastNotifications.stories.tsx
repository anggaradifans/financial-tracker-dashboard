import type { Meta, StoryObj } from '@storybook/react'
import ToastNotifications from './ToastNotifications'
import { notifications } from '../../utils/notifications'

const meta: Meta<typeof ToastNotifications> = {
  title: 'Components/ToastNotifications',
  component: ToastNotifications,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof ToastNotifications>

export const Default: Story = {
  render: () => {
    return (
      <div className="p-8">
        <div className="space-y-4">
          <button
            onClick={() => notifications.success('Transaction saved successfully!')}
            className="px-4 py-2 bg-green-600 text-white rounded-md"
          >
            Show Success Toast
          </button>
          <button
            onClick={() => notifications.error('Failed to save transaction')}
            className="px-4 py-2 bg-red-600 text-white rounded-md"
          >
            Show Error Toast
          </button>
          <button
            onClick={() => notifications.warning('You have unsaved changes')}
            className="px-4 py-2 bg-yellow-600 text-white rounded-md"
          >
            Show Warning Toast
          </button>
          <button
            onClick={() => notifications.info('New features available')}
            className="px-4 py-2 bg-blue-600 text-white rounded-md"
          >
            Show Info Toast
          </button>
        </div>
        <ToastNotifications />
      </div>
    )
  },
}

export const MultipleToasts: Story = {
  render: () => {
    return (
      <div className="p-8">
        <button
          onClick={() => {
            notifications.success('Transaction saved')
            notifications.info('Budget updated')
            notifications.warning('Low balance')
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-md"
        >
          Show Multiple Toasts
        </button>
        <ToastNotifications />
      </div>
    )
  },
}

export const LongMessage: Story = {
  render: () => {
    return (
      <div className="p-8">
        <button
          onClick={() =>
            notifications.success(
              'This is a very long success message that demonstrates how the toast notification handles longer content. It should wrap properly and maintain good readability.'
            )
          }
          className="px-4 py-2 bg-green-600 text-white rounded-md"
        >
          Show Long Toast
        </button>
        <ToastNotifications />
      </div>
    )
  },
}

