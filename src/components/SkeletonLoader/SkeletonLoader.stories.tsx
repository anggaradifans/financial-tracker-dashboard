import type { Meta, StoryObj } from '@storybook/react'
import { CardSkeleton, ChartSkeleton, TableRowSkeleton, SkeletonLoader } from './SkeletonLoader'

const meta: Meta<typeof CardSkeleton> = {
  title: 'Components/SkeletonLoader',
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof CardSkeleton>

export const Card: Story = {
  render: () => (
    <div className="max-w-md">
      <CardSkeleton />
    </div>
  ),
}

export const MultipleCards: Story = {
  render: () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <CardSkeleton />
      <CardSkeleton />
      <CardSkeleton />
      <CardSkeleton />
    </div>
  ),
}

export const Chart: Story = {
  render: () => (
    <div className="max-w-4xl">
      <ChartSkeleton />
    </div>
  ),
}

export const TableRow: Story = {
  render: () => (
    <div className="max-w-6xl">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
        <thead className="bg-gray-50 dark:bg-gray-900">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Date
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Type
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Description
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Amount
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Category
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          <TableRowSkeleton />
          <TableRowSkeleton />
          <TableRowSkeleton />
        </tbody>
      </table>
    </div>
  ),
}

export const GenericLoader: Story = {
  render: () => (
    <div className="max-w-md space-y-2">
      <SkeletonLoader count={3} />
    </div>
  ),
}

export const CustomCount: Story = {
  render: () => (
    <div className="max-w-md space-y-2">
      <SkeletonLoader count={5} />
    </div>
  ),
}

