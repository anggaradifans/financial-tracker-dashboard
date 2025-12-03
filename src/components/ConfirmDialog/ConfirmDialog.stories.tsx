import type { Meta, StoryObj } from '@storybook/react'
import ConfirmDialog from './ConfirmDialog'
import { useState } from 'react'

const meta: Meta<typeof ConfirmDialog> = {
  title: 'Components/ConfirmDialog',
  component: ConfirmDialog,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  argTypes: {
    isOpen: {
      control: 'boolean',
      description: 'Whether the dialog is open',
    },
    title: {
      control: 'text',
      description: 'Dialog title',
    },
    message: {
      control: 'text',
      description: 'Dialog message',
    },
    confirmLabel: {
      control: 'text',
      description: 'Confirm button label',
    },
    cancelLabel: {
      control: 'text',
      description: 'Cancel button label',
    },
    variant: {
      control: 'select',
      options: ['danger', 'warning', 'info'],
      description: 'Dialog variant style',
    },
    onConfirm: {
      action: 'confirmed',
      description: 'Callback when confirm is clicked',
    },
    onCancel: {
      action: 'cancelled',
      description: 'Callback when cancel is clicked',
    },
  },
}

export default meta
type Story = StoryObj<typeof ConfirmDialog>

const InteractiveWrapper = (args: any) => {
  const [isOpen, setIsOpen] = useState(true)
  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 bg-blue-600 text-white rounded-md mb-4"
      >
        Open Dialog
      </button>
      <ConfirmDialog
        {...args}
        isOpen={isOpen}
        onConfirm={() => {
          args.onConfirm()
          setIsOpen(false)
        }}
        onCancel={() => {
          args.onCancel()
          setIsOpen(false)
        }}
      />
    </>
  )
}

export const Danger: Story = {
  render: InteractiveWrapper,
  args: {
    title: 'Delete Transaction',
    message: 'Are you sure you want to delete this transaction? This action cannot be undone.',
    confirmLabel: 'Delete',
    cancelLabel: 'Cancel',
    variant: 'danger',
  },
}

export const Warning: Story = {
  render: InteractiveWrapper,
  args: {
    title: 'Unsaved Changes',
    message: 'You have unsaved changes. Are you sure you want to leave?',
    confirmLabel: 'Leave',
    cancelLabel: 'Stay',
    variant: 'warning',
  },
}

export const Info: Story = {
  render: InteractiveWrapper,
  args: {
    title: 'Confirm Action',
    message: 'Do you want to proceed with this action?',
    confirmLabel: 'Proceed',
    cancelLabel: 'Cancel',
    variant: 'info',
  },
}

export const CustomLabels: Story = {
  render: InteractiveWrapper,
  args: {
    title: 'Custom Action',
    message: 'This dialog has custom button labels.',
    confirmLabel: 'Yes, do it',
    cancelLabel: 'No, thanks',
    variant: 'danger',
  },
}

export const LongMessage: Story = {
  render: InteractiveWrapper,
  args: {
    title: 'Important Notice',
    message: 'This is a very long message that demonstrates how the dialog handles longer content. It should wrap properly and maintain good readability across different screen sizes.',
    confirmLabel: 'I Understand',
    cancelLabel: 'Cancel',
    variant: 'warning',
  },
}

