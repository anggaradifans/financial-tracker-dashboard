import type { Meta, StoryObj } from '@storybook/react'
import { useTheme } from '../../contexts/ThemeContext'
import { LoadingIndicator } from './LoadingIndicator'
import { CardSkeleton } from '../SkeletonLoader'

const meta = {
  title: 'Components/LoadingIndicator',
  component: LoadingIndicator,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: { variant: 'spinner', size: 'md', label: 'Loading financial data…' },
  argTypes: {
    variant: { control: 'select', options: ['spinner', 'bar', 'dots', 'progress'] },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    value: { control: { type: 'range', min: 0, max: 100 } },
  },
} satisfies Meta<typeof LoadingIndicator>

export default meta
type Story = StoryObj<typeof meta>

export const Spinner: Story = {}
export const LoadingBar: Story = { args: { variant: 'bar', label: 'Updating your overview…' } }
export const ActivityDots: Story = { args: { variant: 'dots', label: 'Saving transaction…' } }
export const ImportProgress: Story = { args: { variant: 'progress', value: 64, label: 'Importing transactions…' } }
export const IndeterminateProgress: Story = { args: { variant: 'progress', label: 'Preparing import…' } }
export const IconOnly: Story = { args: { size: 'sm', hideLabel: true, label: 'Saving transaction…' } }

const examples = [
  { name: 'Spinner', usage: 'Short waits in buttons and compact panels.', variant: 'spinner', label: 'Loading transactions…' },
  { name: 'Loading bar', usage: 'Refreshing a section while keeping its data visible.', variant: 'bar', label: 'Updating your overview…' },
  { name: 'Activity dots', usage: 'A quiet status beside an action in progress.', variant: 'dots', label: 'Saving transaction…' },
  { name: 'Import progress', usage: 'Measurable work. Show a percentage only when known.', variant: 'progress', label: 'Importing transactions…' },
] as const

function VariantsPreview() {
  const { theme, toggleTheme } = useTheme()
  const dark = theme === 'dark'
  return (
    <div className={dark ? 'dark' : ''}>
      <main className="mx-auto max-w-5xl bg-gray-50 px-4 py-8 text-gray-900 dark:bg-gray-900 dark:text-white sm:px-8">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Loading states</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-gray-600 dark:text-gray-300">A little feedback for every wait. Blue accents and quiet motion, matched to your financial dashboard.</p>
          </div>
          <button type="button" onClick={toggleTheme} aria-pressed={dark} className="min-h-11 rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">{dark ? 'Light preview' : 'Dark preview'}</button>
        </header>
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          {examples.map(({ name, usage, variant, label }) => (
            <section key={variant} className="grid gap-6 border-b border-gray-200 p-6 last:border-0 dark:border-gray-700 sm:grid-cols-2 sm:items-center sm:gap-10">
              <div>
                <h2 className="text-sm font-semibold">{name}</h2>
                <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-400">{usage}</p>
              </div>
              <div className="flex min-h-16 items-center">
                <LoadingIndicator variant={variant} label={label} value={variant === 'progress' ? 64 : undefined} />
              </div>
            </section>
          ))}
        </div>
        <section className="mt-8">
          <h2 className="text-base font-semibold">Keep the layout while data arrives</h2>
          <p className="mb-4 mt-1 text-sm leading-6 text-gray-600 dark:text-gray-400">Use the existing card skeletons for the first load of the period overview.</p>
          <div role="status">
            <span className="sr-only">Loading period overview…</span>
            <div aria-hidden="true" className="grid gap-4 sm:grid-cols-3 motion-reduce:[&_*]:animate-none">
              <CardSkeleton className="!rounded-xl !p-4 !shadow-none" />
              <CardSkeleton className="!rounded-xl !p-4 !shadow-none" />
              <CardSkeleton className="!rounded-xl !p-4 !shadow-none" />
            </div>
          </div>
        </section>
        <p className="mt-6 text-xs leading-5 text-gray-600 dark:text-gray-400">Preview only. Import progress is illustrative. All indicators respect reduced motion.</p>
      </main>
    </div>
  )
}

export const AllVariants: Story = { render: () => <VariantsPreview /> }
