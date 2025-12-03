import React from 'react'
import type { Preview } from '@storybook/react'
import '../src/App.css'
import { ThemeProvider } from '../src/contexts/ThemeContext'

const preview: Preview = {
  parameters: {
    actions: { argTypesRegex: '^on[A-Z].*' },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: 'light',
      values: [
        {
          name: 'light',
          value: '#ffffff',
        },
        {
          name: 'dark',
          value: '#111827',
        },
      ],
    },
  },
  decorators: [
    (Story) => (
      <ThemeProvider>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
          <Story />
        </div>
      </ThemeProvider>
    ),
  ],
}

export default preview

