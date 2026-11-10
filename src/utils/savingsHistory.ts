import { Transaction } from '../types/financial'
import { supabaseRest } from '../lib/supabaseRest'

export async function loadSavingsHistory(userId: string): Promise<Transaction[]> {
  const rows: Transaction[] = []
  const pageSize = 500
  for (let offset = 0; ; offset += pageSize) {
    const page = await supabaseRest.select<Transaction>('transactions', {
      select: '*,accounts:accounts!transactions_account_owner_fkey(*),categories(*)',
      eq: { user_id: userId },
      is: { deleted_at: null },
      order: 'occurred_at.asc,id.asc',
      limit: pageSize,
      offset,
    })
    rows.push(...page.map(tx => ({ ...tx, account: (tx as Transaction & { accounts?: Transaction['account'] }).accounts ?? tx.account, category: (tx as Transaction & { categories?: Transaction['category'] }).categories ?? tx.category })))
    if (page.length < pageSize) return rows
  }
}
