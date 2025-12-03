import type { Meta, StoryObj } from '@storybook/react'
import DemoBanner from './DemoBanner'
import { MemoryRouter } from 'react-router-dom'

const meta: Meta<typeof DemoBanner> = {
  title: 'Components/DemoBanner',
  component: DemoBanner,
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
type Story = StoryObj<typeof DemoBanner>

export const Default: Story = {
  args: {},
}

