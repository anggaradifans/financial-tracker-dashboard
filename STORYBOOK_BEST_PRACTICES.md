# Storybook Best Practices - Folder Structure

## 📁 Current Structure (Co-location) ✅

Your current structure follows the **co-location pattern**, which is recommended:

```
src/
  components/
    EmptyState.tsx
    EmptyState.stories.tsx        ← Story next to component
    TransactionForm.tsx
    TransactionForm.stories.tsx    ← Story next to component
    ...
```

**Pros:**
- ✅ Easy to find stories (right next to component)
- ✅ Clear component ownership
- ✅ Easy to maintain (update component and story together)
- ✅ Follows React/Next.js conventions

**Cons:**
- ⚠️ Can clutter component folder if you have many stories

## 🎯 Recommended Structure Options

### Option 1: Co-location (Current - Recommended) ⭐

```
src/
  components/
    Button/
      Button.tsx
      Button.stories.tsx
      Button.test.tsx
      index.ts                    ← Barrel export
    TransactionForm/
      TransactionForm.tsx
      TransactionForm.stories.tsx
      TransactionForm.test.tsx
      index.ts
```

**Best for:** Small to medium projects, component libraries

### Option 2: Grouped by Feature/Domain

```
src/
  components/
    auth/
      LoginForm.tsx
      LoginForm.stories.tsx
      RegistrationForm.tsx
      RegistrationForm.stories.tsx
    financial/
      TransactionForm.tsx
      TransactionForm.stories.tsx
      FinancialCharts.tsx
      FinancialCharts.stories.tsx
    ui/
      Button.tsx
      Button.stories.tsx
      EmptyState.tsx
      EmptyState.stories.tsx
```

**Best for:** Large applications with clear domain boundaries

### Option 3: Separate Stories Folder

```
src/
  components/
    Button.tsx
    TransactionForm.tsx
  stories/
    Button.stories.tsx
    TransactionForm.stories.tsx
```

**Best for:** When stories are significantly different from components

## 📋 Storybook Organization Best Practices

### 1. Story Naming Convention

```tsx
// ✅ Good - Clear hierarchy
title: 'Components/FinancialSummaryCards'
title: 'Forms/TransactionForm'
title: 'Layout/Dashboard'

// ❌ Bad - Flat structure
title: 'FinancialSummaryCards'
title: 'TransactionForm'
```

### 2. Group Stories by Category

```tsx
// Components (reusable UI)
title: 'Components/EmptyState'
title: 'Components/Button'
title: 'Components/ConfirmDialog'

// Forms (form components)
title: 'Forms/TransactionForm'
title: 'Forms/LoginForm'

// Layout (page-level components)
title: 'Layout/Dashboard'
title: 'Layout/Header'

// Features (domain-specific)
title: 'Features/Financial/SummaryCards'
title: 'Features/Auth/LoginForm'
```

### 3. Use Barrel Exports

```tsx
// components/Button/index.ts
export { default } from './Button'
export type { ButtonProps } from './Button'

// Then in stories
import Button from '../components/Button'
```

## 🎨 Recommended Components to Add Stories

### High Priority (Reusable UI Components)
1. ✅ **ConfirmDialog** - Dialog component with variants
2. ✅ **PeriodFilter** - Date filter component
3. ✅ **ToastNotifications** - Notification system
4. ✅ **BudgetProgressCards** - Progress visualization

### Medium Priority (Feature Components)
5. ✅ **LoginForm** - Authentication form
6. ✅ **RegistrationForm** - Registration form
7. ✅ **FinancialCharts** - Chart components
8. ✅ **TransactionTable** - Data table

### Lower Priority (Page Components)
9. ⚠️ **Dashboard** - Complex, might be better as integration tests
10. ⚠️ **AuthFlow** - Simple wrapper, less value

## 📝 Story Organization Tips

### Group Related Stories
```tsx
// All form stories together
title: 'Forms/TransactionForm'
title: 'Forms/LoginForm'
title: 'Forms/RegistrationForm'

// All financial components together
title: 'Financial/SummaryCards'
title: 'Financial/Charts'
title: 'Financial/TransactionTable'
```

### Use Tags for Organization
```tsx
tags: ['autodocs', 'design-system']  // Design system components
tags: ['autodocs', 'forms']          // Form components
tags: ['autodocs', 'feature']         // Feature components
```

## 🚀 Implementation Priority

### Phase 1: Core UI Components (Do First)
- ConfirmDialog
- PeriodFilter
- ToastNotifications

### Phase 2: Feature Components
- BudgetProgressCards
- FinancialCharts
- TransactionTable

### Phase 3: Forms
- LoginForm
- RegistrationForm

## 📚 Additional Best Practices

1. **Keep stories simple** - One story per state/variant
2. **Use args** - Make stories interactive with controls
3. **Document props** - Use JSDoc comments in components
4. **Add interactions** - Test user interactions
5. **Visual regression** - Consider Chromatic for visual testing
6. **Accessibility** - Use a11y addon to test accessibility

## 🎯 Your Current Structure Assessment

**Current:** Co-location pattern ✅
**Recommendation:** Keep current structure, add more stories

**Next Steps:**
1. Add stories for high-priority components
2. Organize stories with clear titles (Components/, Forms/, etc.)
3. Add tags for better filtering
4. Consider grouping complex components into folders

