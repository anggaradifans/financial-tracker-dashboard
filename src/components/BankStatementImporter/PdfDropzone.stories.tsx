import type { Meta, StoryObj } from '@storybook/react'
import { PdfDropzone } from './PdfDropzone'

const meta = {
  title: 'Components/Statement loading',
  component: PdfDropzone,
  parameters: { layout: 'padded' },
  args: { onFileLoaded: () => {}, isLoading: true },
} satisfies Meta<typeof PdfDropzone>

export default meta
type Story = StoryObj<typeof meta>

export const Reading: Story = { args: { readingProgress: { completed: 3, total: 10 } } }
export const Processing: Story = {}
export const Ready: Story = { args: { isLoading: false } }
