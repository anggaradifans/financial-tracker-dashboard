import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react'
import { Account, FinancialGoal } from '../../types/financial'
import { CurrentWealthEntry, WealthCategory, WealthClassification, WealthKind, WealthSaveInput } from '../../types/wealth'
import { wealthCategories, wealthClassifications, wealthError, wealthToday } from '../../utils/wealth'

const field = 'mt-1 min-h-11 w-full rounded-md border border-gray-500 bg-white px-3 text-gray-900 placeholder:text-gray-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 disabled:bg-gray-100 dark:border-gray-400 dark:bg-gray-900 dark:text-white dark:placeholder:text-gray-300 dark:disabled:bg-gray-800 dark:focus-visible:outline-primary-400'
const button = 'min-h-11 rounded-md border border-gray-300 px-4 text-sm font-semibold hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 disabled:opacity-50 dark:border-gray-600 dark:hover:bg-gray-700'

interface Props {
  entry?: CurrentWealthEntry
  kind: WealthKind
  accounts: Account[]
  goals: FinancialGoal[]
  onSave: (input: WealthSaveInput, revisionId: string) => Promise<void>
  onClose: () => void
}

export default function WealthEntryForm({ entry, kind, accounts, goals, onSave, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const entryId = useRef(entry?.id || crypto.randomUUID())
  const request = useRef<{ json: string; id: string } | null>(null)
  const [name, setName] = useState(entry?.name || '')
  const [category, setCategory] = useState<WealthCategory>(entry?.category || (kind === 'asset' ? 'property' : 'mortgage'))
  const [classification, setClassification] = useState<WealthClassification>(entry?.classification || 'other')
  const [currency, setCurrency] = useState(entry?.currency || 'IDR')
  const [source, setSource] = useState<'manual' | 'account'>(entry?.source || 'manual')
  const [accountId, setAccountId] = useState(entry?.account_id || '')
  const [goalId, setGoalId] = useState(entry?.goal_id || '')
  const [unknown, setUnknown] = useState(entry?.missing_value || false)
  const [amount, setAmount] = useState(entry?.amount == null ? '' : String(entry.amount))
  const [date, setDate] = useState(entry?.valued_on || wealthToday())
  const [notes, setNotes] = useState(entry?.notes || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const account = accounts.find(item => item.id === accountId)
  const effectiveCurrency = source === 'account' && account ? account.currency.trim() : currency
  const goalOptions = goals.filter(item => item.currency.trim() === effectiveCurrency && (item.status === 'active' || item.id === goalId))

  useEffect(() => {
    const element = dialog.current!
    element.showModal()
    return () => element.close()
  }, [])

  const containFocus = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== 'Tab') return
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])')]
      .filter(element => element.getClientRects().length > 0)
    const first = controls[0]
    const last = controls[controls.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setError(null)
    if (!name.trim()) { setError('Enter a name for this entry.'); return }
    if (source === 'manual' && !unknown && (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(amount) || Number(amount) >= 1e13)) {
      setError('Enter an amount from 0 to under 10 trillion, with at most two decimals.'); return
    }
    if (source === 'manual' && !unknown && (!date || date > wealthToday())) {
      setError('Choose a valuation date of today or earlier.'); return
    }
    const input: WealthSaveInput = {
      id: entryId.current, name: name.trim(), kind, category, classification: kind === 'liability' ? 'other' : classification,
      currency: effectiveCurrency, account_id: source === 'account' ? accountId : null,
      goal_id: kind === 'asset' && goalOptions.some(item => item.id === goalId) ? goalId : null,
      amount: source === 'manual' && !unknown ? Number(amount) : null,
      valued_on: source === 'manual' && !unknown ? date : null,
      notes: notes.trim() || null, expected_updated_at: entry?.updated_at || null,
    }
    const json = JSON.stringify(input)
    if (request.current?.json !== json) request.current = { json, id: crypto.randomUUID() }
    setBusy(true)
    try { await onSave(input, request.current.id); onClose() }
    catch (err) { setError(wealthError(err)) }
    finally { setBusy(false) }
  }

  return <dialog ref={dialog} aria-labelledby="wealth-form-title" onKeyDown={containFocus} onCancel={event => { event.preventDefault(); if (!busy) onClose() }} className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-xl bg-white p-5 text-gray-900 shadow-xl backdrop:bg-gray-950/50 dark:bg-gray-800 dark:text-white sm:p-6">
    <h2 id="wealth-form-title" className="text-xl font-semibold">{entry ? 'Edit' : 'Add'} {kind}</h2>
    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{kind === 'asset' ? 'Record property, investments or cash you own.' : 'Record the outstanding debt, excluding future interest.'} Updates preserve earlier valuations.</p>
    <form onSubmit={event => void submit(event)} className="mt-5 space-y-4">
      <label className="block text-sm font-medium">Name<input autoFocus required maxLength={100} value={name} onChange={event => setName(event.target.value)} className={field} placeholder={kind === 'asset' ? 'e.g. Jakarta apartment' : 'e.g. Apartment mortgage'} /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">Category<select value={category} onChange={event => setCategory(event.target.value as WealthCategory)} className={field}>{Object.entries(wealthCategories).filter(([key]) => kind === 'liability' ? ['mortgage', 'loan', 'credit_card', 'other'].includes(key) : !['mortgage', 'loan', 'credit_card'].includes(key)).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        {kind === 'asset' && <label className="text-sm font-medium">Classification<select value={classification} onChange={event => setClassification(event.target.value as WealthClassification)} className={field}>{Object.entries(wealthClassifications).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
        <label className="text-sm font-medium">Value source<select disabled={!!entry} value={source} onChange={event => { setSource(event.target.value as 'manual' | 'account'); setGoalId('') }} className={field}><option value="manual">Manual valuation</option><option value="account">Linked account balance</option></select></label>
        {source === 'account' ? <label className="text-sm font-medium">Linked account<select required disabled={!!entry} value={accountId} onChange={event => { setAccountId(event.target.value); setGoalId('') }} className={field}><option value="">Choose an account</option>{accounts.map(item => <option key={item.id} value={item.id}>{item.name} ({item.currency.trim()})</option>)}</select></label>
          : <label className="text-sm font-medium">Currency<input required disabled={!!entry} pattern="[A-Z]{3}" maxLength={3} value={currency} onChange={event => { setCurrency(event.target.value.toUpperCase()); setGoalId('') }} className={field} /><span className="mt-1 block text-xs font-normal text-gray-600 dark:text-gray-300">Three-letter code, e.g. IDR or USD.</span></label>}
      </div>
      {kind === 'asset' && <p className="text-xs text-gray-600 dark:text-gray-300">Choose Primary residence for the home you live in. Rental property and investments can be Investable assets.</p>}
      {entry && <p className="text-xs text-gray-600 dark:text-gray-300">Currency and value source stay fixed to preserve history. Archive and add another entry to change them.</p>}
      {source === 'account' ? <p className="rounded-lg bg-gray-100 p-3 text-sm text-gray-700 dark:bg-gray-900 dark:text-gray-300">The account counts once, using all recorded transactions up to now. This may exclude money held before tracking began. {kind === 'liability' ? 'The absolute tracked balance is treated as outstanding debt.' : 'A negative balance counts as a liability.'} Do not add this same balance as another manual entry.</p>
        : <>
          <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={unknown} onChange={event => setUnknown(event.target.checked)} className="h-4 w-4 accent-primary-600" />I don’t have a valuation yet</label>
          {!unknown && <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">{kind === 'asset' ? 'Current value' : 'Outstanding balance'} ({currency})<input required type="number" min="0" max="9999999999999.99" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} className={field} /></label><label className="text-sm font-medium">Valuation date<input required type="date" max={wealthToday()} value={date} onChange={event => setDate(event.target.value)} className={field} /></label></div>}
          {unknown && <p className="text-sm text-gray-600 dark:text-gray-300">This entry will be excluded from totals and marked as missing a value.</p>}
        </>}
      {kind === 'asset' && <label className="block text-sm font-medium">Goal earmark (optional)<select value={goalId} onChange={event => setGoalId(event.target.value)} className={field}><option value="">No linked goal</option>{goalOptions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><span className="mt-1 block text-xs font-normal text-gray-600 dark:text-gray-300">A label for planning. Goal contributions do not add to net worth or change this value.</span></label>}
      <label className="block text-sm font-medium">Notes (optional)<textarea maxLength={500} rows={2} value={notes} onChange={event => setNotes(event.target.value)} className={`${field} py-2`} /></label>
      {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">{error}</p>}
      <div className="flex flex-wrap justify-end gap-3"><button type="button" disabled={busy} onClick={onClose} className={button}>Cancel</button><button type="submit" disabled={busy} className="min-h-11 rounded-md bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 disabled:opacity-50">{busy ? 'Saving…' : `Save ${kind}`}</button></div>
    </form>
  </dialog>
}
