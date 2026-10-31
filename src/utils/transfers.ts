import {
  Account,
  CategoryBreakdown,
  StoredTransactionType,
  TimeSeriesData,
  Transaction,
  TransactionType,
} from '../types/financial'

// A transfer is two transactions (a debit and a credit) that share a transfer_id.
// Everything that totals money or draws a row has to decide what a leg means, so the
// rules live here once. Code that filters on an explicit 'income' or 'outcome' already
// leaves transfers out; code that treats "anything else" as spending must not.

type Typed = Pick<Transaction, 'type' | 'amount'>

export const isTransferType = (type: string): boolean => type === 'transfer_out' || type === 'transfer_in'

// Effect on the balance of the account a row belongs to. A type this function does not
// know counts as nothing instead of being guessed at.
export function balanceEffect(tx: Typed): number {
  const amount = Number(tx.amount)
  switch (tx.type) {
    case 'income':
    case 'transfer_in':
      return amount
    case 'outcome':
    case 'transfer_out':
      return -amount
    default:
      return 0
  }
}

export function sumBalance(transactions: Typed[]): number {
  return transactions.reduce((sum, tx) => sum + balanceEffect(tx), 0)
}

export type AmountTone = 'positive' | 'negative' | 'neutral'

// Transfers are neutral: moving money between your own accounts is neither income nor spending.
export function amountTone(type: StoredTransactionType): AmountTone {
  if (type === 'income') return 'positive'
  if (type === 'outcome') return 'negative'
  return 'neutral'
}

export const amountSign = (type: StoredTransactionType): '+' | '-' =>
  balanceEffect({ type, amount: 1 }) >= 0 ? '+' : '-'

// Income and outcome per day. Transfer legs are skipped, and a day with only transfers
// does not appear.
export function buildTimeSeries(transactions: Pick<Transaction, 'type' | 'amount' | 'occurred_at'>[]): TimeSeriesData[] {
  const grouped: Record<string, TimeSeriesData> = {}
  for (const tx of transactions) {
    if (tx.type !== 'income' && tx.type !== 'outcome') continue
    const date = new Date(tx.occurred_at).toISOString().split('T')[0]
    const day = grouped[date] ?? (grouped[date] = { date, income: 0, outcome: 0, net: 0 })
    if (tx.type === 'income') day.income += Number(tx.amount)
    else day.outcome += Number(tx.amount)
    day.net = day.income - day.outcome
  }
  return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date))
}

// Amount and count per category and type. Transfer legs have no category and are skipped.
export function buildCategoryBreakdown(transactions: Transaction[], type?: TransactionType): CategoryBreakdown[] {
  const breakdown: Record<string, CategoryBreakdown> = {}
  for (const tx of transactions) {
    if (tx.type !== 'income' && tx.type !== 'outcome') continue
    if (type && tx.type !== type) continue
    // Only transfer legs may have no category, and they were skipped above.
    if (tx.category_id === null) continue
    const key = `${tx.category_id}-${tx.type}`
    const entry = breakdown[key] ?? (breakdown[key] = {
      category_id: tx.category_id,
      category_name: tx.category?.name || 'Unknown',
      amount: 0,
      count: 0,
      type: tx.type,
    })
    entry.amount += Number(tx.amount)
    entry.count += 1
  }
  return Object.values(breakdown).sort((a, b) => b.amount - a.amount)
}

export const categoryLabel = (tx: Pick<Transaction, 'type' | 'category'>): string =>
  tx.category?.name || (isTransferType(tx.type) ? 'Transfer' : 'Uncategorized')

// The other leg of the same transfer, when it is in the same list.
export function transferPartner(
  transactions: Transaction[],
  tx: Pick<Transaction, 'id' | 'transfer_id'>,
): Transaction | undefined {
  if (!tx.transfer_id) return undefined
  return transactions.find(other => other.transfer_id === tx.transfer_id && other.id !== tx.id)
}

export function transferLabel(tx: Pick<Transaction, 'type'>, partnerAccountName?: string | null): string {
  if (tx.type === 'transfer_in') return partnerAccountName ? `Transfer from ${partnerAccountName}` : 'Transfer in'
  return partnerAccountName ? `Transfer to ${partnerAccountName}` : 'Transfer out'
}

export interface TransactionDeleteApi {
  softDelete(id: string): Promise<unknown>
  deleteTransfer(transferId: string): Promise<unknown>
}

// Deletes one transaction, or both legs of a transfer, and returns the ids that are gone.
// A leg cannot be soft-deleted directly (the database refuses it), so a transfer goes
// through its own RPC. Nothing is reported as removed unless the call succeeded.
export async function deleteTransactionRecord(
  transactions: Pick<Transaction, 'id' | 'transfer_id'>[],
  id: string,
  api: TransactionDeleteApi,
): Promise<string[]> {
  const target = transactions.find(tx => tx.id === id)
  if (target?.transfer_id) {
    await api.deleteTransfer(target.transfer_id)
    return transactions.filter(tx => tx.transfer_id === target.transfer_id).map(tx => tx.id)
  }
  await api.softDelete(id)
  return [id]
}

// A transfer is not edited in place: delete it and record it again.
export function assertEditable(tx: Pick<Transaction, 'transfer_id'> | undefined): void {
  if (tx?.transfer_id) {
    throw new Error('A transfer cannot be edited. Delete it and record it again.')
  }
}

// ---------------------------------------------------------------------------
// The transfer form. The rules mirror create_transfer so a mistake shows up in the form
// before a round trip; the database still decides.
// ---------------------------------------------------------------------------

export interface TransferFormValues {
  fromAccountId: string
  toAccountId: string
  amount: string
  // yyyy-MM-dd, the same date-only convention as the transaction form
  occurredOn: string
  description: string
}

export type TransferFormErrors = Partial<Record<keyof TransferFormValues, string>>

// Names and order match create_transfer's parameters; a test reads the migration to keep them equal.
export interface CreateTransferParams {
  p_from_account_id: string
  p_to_account_id: string
  p_amount: number
  p_currency: string
  p_occurred_at: string
  p_description: string | null
  p_transfer_id: string
}

// Keeps the amount exact to the cent when it travels as a JSON number.
const MAX_TRANSFER_AMOUNT = 1e13

const currencyOf = (account: Pick<Account, 'currency'>): string => account.currency.trim()

// Accounts the money can go to: any other account in the same currency.
export function transferTargets(accounts: Account[], fromAccountId: string): Account[] {
  const from = accounts.find(account => account.id === fromAccountId)
  if (!from) return []
  return accounts.filter(account => account.id !== from.id && currencyOf(account) === currencyOf(from))
}

// A transfer needs two accounts that share a currency.
export const canTransfer = (accounts: Account[]): boolean =>
  accounts.some(account => transferTargets(accounts, account.id).length > 0)

export function validateTransfer(values: TransferFormValues, accounts: Account[]): TransferFormErrors {
  const errors: TransferFormErrors = {}
  const from = accounts.find(account => account.id === values.fromAccountId)
  const to = accounts.find(account => account.id === values.toAccountId)

  if (!from) errors.fromAccountId = 'Choose the account the money leaves'
  if (!values.toAccountId) errors.toAccountId = 'Choose the account the money goes to'
  else if (!to) errors.toAccountId = 'Choose a valid destination account'
  else if (from && to.id === from.id) errors.toAccountId = 'Choose a different account'
  else if (from && currencyOf(to) !== currencyOf(from)) {
    errors.toAccountId = `Both accounts must use the same currency (${currencyOf(from)})`
  }

  const amount = values.amount.trim()
  if (!amount) errors.amount = 'Amount is required'
  else if (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(amount)) errors.amount = 'Enter a positive amount with at most two decimals'
  else if (Number(amount) <= 0) errors.amount = 'Amount must be greater than zero'
  else if (Number(amount) >= MAX_TRANSFER_AMOUNT) errors.amount = 'Amount is too large'

  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.occurredOn) || Number.isNaN(new Date(values.occurredOn).getTime())) {
    errors.occurredOn = 'Choose a valid date'
  }
  if (values.description.trim().length > 500) errors.description = 'Description must be 500 characters or fewer'
  return errors
}

// The currency is the source account's, never typed. transferId is the idempotency key:
// the same key with the same details returns the same transfer instead of a second one.
export function buildCreateTransferParams(
  values: TransferFormValues,
  accounts: Account[],
  transferId: string,
): CreateTransferParams {
  const from = accounts.find(account => account.id === values.fromAccountId)
  const to = accounts.find(account => account.id === values.toAccountId)
  if (!from || !to) throw new Error('Choose both accounts')
  return {
    p_from_account_id: from.id,
    p_to_account_id: to.id,
    p_amount: Number(values.amount.trim()),
    p_currency: currencyOf(from),
    p_occurred_at: new Date(values.occurredOn).toISOString(),
    p_description: values.description.trim() || null,
    p_transfer_id: transferId,
  }
}

// Turns the REST client's "Supabase RPC error: 400 - {json}" into something to show. Only
// the database's own validation messages are passed through; anything else stays generic.
export function transferErrorMessage(error: unknown): string {
  const message = (error as { message?: unknown } | null | undefined)?.message
  const raw = typeof message === 'string' ? message : ''
  const start = raw.indexOf('{')
  if (start >= 0) {
    try {
      const body = JSON.parse(raw.slice(start))
      if (body?.code === '23505') return 'This transfer was already saved, or its details changed. Close the form and check your transactions.'
      if (body?.code === '22003') return 'The amount is too large.'
      if (body?.code === '42501') return 'Please sign in again to save a transfer.'
      if (body?.code === '22023' && typeof body.message === 'string') return body.message
    } catch {
      // not JSON: fall through to the generic message
    }
  }
  return 'Could not save the transfer. Please try again.'
}
