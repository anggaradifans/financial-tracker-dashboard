import { Transaction, Account, Category, Budget } from '../types/financial'

// Demo user ID
export const DEMO_USER_ID = 'demo-user-12345'
const now = new Date()

// Demo Categories
export const demoCategories: Category[] = [
  { id: 'cat-1', name: 'Food & Dining', allowed_type: 'outcome', created_at: new Date().toISOString() },
  { id: 'cat-2', name: 'Transportation', allowed_type: 'outcome', created_at: new Date().toISOString() },
  { id: 'cat-3', name: 'Shopping', allowed_type: 'outcome', created_at: new Date().toISOString() },
  { id: 'cat-4', name: 'Bills & Utilities', allowed_type: 'outcome', created_at: new Date().toISOString() },
  { id: 'cat-5', name: 'Entertainment', allowed_type: 'outcome', created_at: new Date().toISOString() },
  { id: 'cat-6', name: 'Salary', allowed_type: 'income', created_at: new Date().toISOString() },
  { id: 'cat-7', name: 'Freelance', allowed_type: 'income', created_at: new Date().toISOString() },
  { id: 'cat-8', name: 'Investment', allowed_type: 'income', created_at: new Date().toISOString() },
]

// Demo Accounts
export const demoAccounts: Account[] = [
  { id: 'acc-1', name: 'Cash', currency: 'IDR', created_at: new Date().toISOString() },
  { id: 'acc-2', name: 'Bank Account', currency: 'IDR', created_at: new Date().toISOString() },
  { id: 'acc-3', name: 'Credit Card', currency: 'IDR', created_at: new Date().toISOString() },
]

// Generate demo transactions for the last 30 days
const generateDemoTransactions = (): Transaction[] => {
  const transactions: Transaction[] = []
  const now = new Date()
  
  // Income transactions
  const incomeCategories = demoCategories.filter(c => c.allowed_type === 'income' || c.allowed_type === 'both')
  const outcomeCategories = demoCategories.filter(c => c.allowed_type === 'outcome' || c.allowed_type === 'both')
  
  // Add monthly salary (first of month)
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  transactions.push({
    id: 'tx-income-1',
    type: 'income',
    amount: 15000000,
    currency: 'IDR',
    description: 'Monthly Salary',
    occurred_at: firstOfMonth.toISOString(),
    created_at: firstOfMonth.toISOString(),
    category_id: incomeCategories[0].id,
    account_id: demoAccounts[1].id,
    metadata: {},
    user_id: DEMO_USER_ID,
    category: incomeCategories[0],
    account: demoAccounts[1],
  })

  // Add some freelance income
  const freelanceDate = new Date(now)
  freelanceDate.setDate(freelanceDate.getDate() - 5)
  transactions.push({
    id: 'tx-income-2',
    type: 'income',
    amount: 2500000,
    currency: 'IDR',
    description: 'Freelance Project',
    occurred_at: freelanceDate.toISOString(),
    created_at: freelanceDate.toISOString(),
    category_id: incomeCategories[1]?.id || incomeCategories[0].id,
    account_id: demoAccounts[1].id,
    metadata: {},
    user_id: DEMO_USER_ID,
    category: incomeCategories[1] || incomeCategories[0],
    account: demoAccounts[1],
  })

  // Generate outcome transactions for the last 30 days
  const outcomeAmounts = [50000, 75000, 100000, 150000, 200000, 250000, 300000, 500000]
  const descriptions = [
    'Lunch at restaurant',
    'Grocery shopping',
    'Uber ride',
    'Coffee with friends',
    'Movie tickets',
    'Online shopping',
    'Electricity bill',
    'Phone bill',
    'Gym membership',
    'Dinner out',
  ]

  for (let i = 0; i < 25; i++) {
    const daysAgo = Math.floor(Math.random() * 30)
    const date = new Date(now)
    date.setDate(date.getDate() - daysAgo)
    date.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60), 0, 0)

    const category = outcomeCategories[Math.floor(Math.random() * outcomeCategories.length)]
    const account = demoAccounts[Math.floor(Math.random() * demoAccounts.length)]
    const amount = outcomeAmounts[Math.floor(Math.random() * outcomeAmounts.length)]
    const description = descriptions[Math.floor(Math.random() * descriptions.length)]

    transactions.push({
      id: `tx-outcome-${i}`,
      type: 'outcome',
      amount,
      currency: 'IDR',
      description,
      occurred_at: date.toISOString(),
      created_at: date.toISOString(),
      category_id: category.id,
      account_id: account.id,
      metadata: {},
      user_id: DEMO_USER_ID,
      category,
      account,
    })
  }

  // Sort by date (newest first)
  return transactions.sort((a, b) => 
    new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()
  )
}

export const demoTransactions: Transaction[] = generateDemoTransactions()

// Demo Budgets
export const demoBudgets: Budget[] = [
  {
    id: 'budget-1',
    category_id: demoCategories[0].id, // Food & Dining
    amount: 2000000,
    currency: 'IDR',
    period: 'monthly',
    start_date: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
    created_at: new Date().toISOString(),
    user_id: DEMO_USER_ID,
    categories: demoCategories[0],
  },
  {
    id: 'budget-2',
    category_id: demoCategories[2].id, // Shopping
    amount: 1500000,
    currency: 'IDR',
    period: 'monthly',
    start_date: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
    created_at: new Date().toISOString(),
    user_id: DEMO_USER_ID,
    categories: demoCategories[2],
  },
]

