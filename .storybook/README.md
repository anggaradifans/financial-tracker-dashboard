# Storybook Configuration

This project uses Storybook for component development and documentation.

## Getting Started

### Start Storybook
```bash
npm run storybook
```

This will start Storybook on `http://localhost:6006`

### Build Storybook
```bash
npm run build-storybook
```

This creates a static build of Storybook that can be deployed.

## Features

- **React + TypeScript** support
- **Tailwind CSS** integration
- **Dark mode** theme support via ThemeContext
- **Vite** build system for fast HMR
- **Auto-documentation** with autodocs tag

## Addons Included

- `@storybook/addon-essentials` - Core addons (controls, actions, docs, etc.)
- `@storybook/addon-interactions` - Test component interactions
- `@storybook/addon-links` - Link between stories
- `@storybook/addon-viewport` - Test responsive designs

## Writing Stories

Stories are located alongside components with the `.stories.tsx` extension.

Example:
```tsx
import type { Meta, StoryObj } from '@storybook/react'
import MyComponent from './MyComponent'

const meta: Meta<typeof MyComponent> = {
  title: 'Components/MyComponent',
  component: MyComponent,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof MyComponent>

export const Default: Story = {
  args: {
    // component props
  },
}
```

## Theme Support

The preview is configured with ThemeProvider, so all components automatically support dark mode. Use the background tool in Storybook to test different themes.

## Tips

- Use `tags: ['autodocs']` to auto-generate documentation
- Use `action()` for event handlers to see them in the Actions panel
- Use `control: false` to hide props from controls
- Use decorators to wrap stories with providers or routers

