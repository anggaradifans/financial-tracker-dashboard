# Storybook Setup Guide

## ✅ What's Been Set Up

Storybook has been successfully configured for your Financial Tracker project!

### Installed Packages
- `@storybook/react` - React framework
- `@storybook/react-vite` - Vite integration
- `@storybook/addon-essentials` - Core addons (controls, actions, docs, etc.)
- `@storybook/addon-interactions` - Component interaction testing
- `@storybook/addon-links` - Link between stories
- `@storybook/addon-viewport` - Responsive design testing

### Configuration Files
- `.storybook/main.ts` - Main Storybook configuration
- `.storybook/preview.ts` - Global decorators and parameters
- `.storybook/README.md` - Detailed Storybook documentation

### Example Stories Created
1. **EmptyState** - Shows empty state variations
2. **FinancialSummaryCards** - Financial summary card component
3. **TransactionForm** - Transaction form with different states
4. **DemoBanner** - Demo mode banner
5. **SkeletonLoader** - Loading skeleton components

## 🚀 Getting Started

### Start Storybook
```bash
npm run storybook
```

This will:
- Start Storybook on `http://localhost:6006`
- Watch for changes and hot-reload
- Show all your component stories

### Build Storybook (for deployment)
```bash
npm run build-storybook
```

This creates a static build in the `storybook-static` directory.

## 📝 Creating New Stories

Create a `.stories.tsx` file next to your component:

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import MyComponent from './MyComponent'

const meta: Meta<typeof MyComponent> = {
  title: 'Components/MyComponent',
  component: MyComponent,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered', // or 'padded', 'fullscreen'
  },
}

export default meta
type Story = StoryObj<typeof MyComponent>

export const Default: Story = {
  args: {
    // Your component props
  },
}

export const WithDifferentProps: Story = {
  args: {
    // Different props
  },
}
```

## 🎨 Features

### Dark Mode Support
All components automatically support dark mode through the ThemeProvider decorator. Use the background tool in Storybook to test different themes.

### Tailwind CSS
Tailwind CSS is fully integrated - all your styles work in Storybook.

### Auto-Documentation
Components with `tags: ['autodocs']` automatically generate documentation pages.

### Controls
Use the Controls panel to interactively change component props:
```tsx
argTypes: {
  title: {
    control: 'text',
    description: 'Main title text',
  },
  amount: {
    control: 'number',
    description: 'Transaction amount',
  },
}
```

### Actions
Use `action()` for event handlers to see them in the Actions panel:
```tsx
onClick: {
  action: 'clicked',
  description: 'Callback when button is clicked',
}
```

## 📚 Available Stories

- **Components/EmptyState** - Empty state component variations
- **Components/FinancialSummaryCards** - Financial summary cards
- **Components/TransactionForm** - Transaction form component
- **Components/DemoBanner** - Demo mode banner
- **Components/SkeletonLoader** - Loading skeletons

## 💡 Tips

1. **Use decorators** for providers (Router, Theme, etc.)
2. **Use parameters** to control layout and backgrounds
3. **Use argTypes** to customize controls and documentation
4. **Use tags** for auto-documentation
5. **Test different states** - loading, error, empty, success

## 🔗 Resources

- [Storybook Documentation](https://storybook.js.org/docs)
- [Storybook for React](https://storybook.js.org/docs/react/get-started/introduction)
- [Writing Stories](https://storybook.js.org/docs/react/writing-stories/introduction)

## 🎯 Next Steps

1. Add more stories for your components
2. Document component props and usage
3. Add interaction tests
4. Create visual regression tests
5. Deploy Storybook for team access

Happy storytelling! 🎨

