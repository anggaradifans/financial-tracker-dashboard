import { useEffect, useRef, useState } from 'react'
import { Account } from '../../types/financial'
import { CurrentWealthEntry, WealthKind, WealthSnapshot, WealthTotal, WealthValuation } from '../../types/wealth'
import { useNetWorth } from '../../hooks/useNetWorth'
import { wealthCategories, wealthClassifications, wealthError, wealthMoney, wealthToday, wealthTotals } from '../../utils/wealth'
import WealthEntryForm from './WealthEntryForm'

const button = 'inline-flex min-h-11 items-center justify-center rounded-md border border-gray-300 px-3 text-sm font-semibold hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 disabled:opacity-50 dark:border-gray-600 dark:hover:bg-gray-700'
const secondary = 'text-sm text-gray-600 dark:text-gray-300'
const dateTime = (date: string) => new Date(date).toLocaleString('id-ID')

function Total({ total }: { total: WealthTotal }) {
  return <section aria-label={`${total.currency} net worth`} className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0"><h2 className={secondary}>Net worth · {total.currency}</h2><p className={`mt-2 break-words text-3xl font-semibold tabular-nums ${total.net_worth < 0 ? 'text-red-700 dark:text-red-300' : 'text-gray-900 dark:text-white'}`}>{wealthMoney(total.net_worth, total.currency)}</p><p className={`mt-2 ${secondary}`}>Assets minus outstanding debts</p></div>
      <dl className="grid min-w-0 gap-x-8 gap-y-3 sm:grid-cols-2"><div><dt className={secondary}>Total assets</dt><dd className="mt-1 break-words text-lg font-semibold tabular-nums">{wealthMoney(total.assets, total.currency)}</dd></div><div><dt className={secondary}>Total liabilities</dt><dd className="mt-1 break-words text-lg font-semibold tabular-nums">{wealthMoney(total.liabilities, total.currency)}</dd></div></dl>
    </div>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-3 dark:border-gray-700"><p className={secondary}>Investable assets <strong className="ml-1 font-semibold text-gray-900 dark:text-white">{wealthMoney(total.investable, total.currency)}</strong></p><p className="text-xs text-gray-600 dark:text-gray-300">Primary residence and emergency reserves are separate.</p></div>
    {(total.missing_count > 0 || total.stale_count > 0) && <p className="mt-3 text-sm text-amber-800 dark:text-amber-200">{total.missing_count > 0 ? `Partial total: ${total.missing_count} missing ${total.missing_count === 1 ? 'valuation' : 'valuations'} excluded. ` : ''}{total.stale_count > 0 ? `${total.stale_count} ${total.stale_count === 1 ? 'valuation' : 'valuations'} over 90 days old included. Review their current value.` : ''}</p>}
  </section>
}

function EntryHistory({ revisions }: { revisions: WealthValuation[] }) {
  if (!revisions.length) return null
  return <details className="mt-2"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 dark:text-primary-400">Valuation history ({revisions.length})</summary><ul className="space-y-2 pb-2">{revisions.map(revision => <li key={revision.id} className="border-l-2 border-gray-200 pl-3 text-sm dark:border-gray-600"><p className="break-words font-medium">{revision.request.account_id ? 'Linked account source' : revision.amount === null ? 'Value not recorded' : wealthMoney(Number(revision.amount), revision.request.currency)}{revision.valued_on ? ` · valued ${revision.valued_on}` : ''}</p><p className={secondary}>Recorded {dateTime(revision.recorded_at)} · {revision.request.name}{revision.request.kind === 'asset' ? ` · ${wealthClassifications[revision.request.classification]}` : ''}</p></li>)}</ul></details>
}

function SnapshotHistory({ snapshots }: { snapshots: WealthSnapshot[] }) {
  return <section aria-labelledby="wealth-history-title" className="space-y-3"><h2 id="wealth-history-title" className="text-lg font-semibold">Saved net worth history</h2><p className={secondary}>Snapshots freeze the values and classifications you had when saved. Later changes leave these records intact. Showing the latest 50.</p>
    {snapshots.length === 0 ? <p className="rounded-lg border border-dashed border-gray-300 p-5 text-sm text-gray-600 dark:border-gray-600 dark:text-gray-300">No snapshots yet. Save a snapshot to start a dated history.</p> : snapshots.map(snapshot => <details key={snapshot.id} className="rounded-lg border border-gray-200 bg-white px-4 dark:border-gray-700 dark:bg-gray-800"><summary className="flex min-h-14 cursor-pointer flex-wrap items-center justify-between gap-3 py-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"><span className="font-semibold">{dateTime(snapshot.captured_at)}</span><span className="flex flex-wrap gap-x-5 gap-y-1">{snapshot.totals.map(total => <span key={total.currency} className="break-words tabular-nums">{total.currency} · {wealthMoney(Number(total.net_worth), total.currency)}{total.missing_count > 0 ? ' (partial)' : ''}</span>)}</span></summary><div className="space-y-4 border-t border-gray-200 py-4 dark:border-gray-700">
      {snapshot.totals.map(total => <dl key={total.currency} className="grid gap-2 text-sm sm:grid-cols-3"><div><dt className={secondary}>Assets ({total.currency})</dt><dd className="break-words font-medium">{wealthMoney(Number(total.assets), total.currency)}</dd></div><div><dt className={secondary}>Liabilities</dt><dd className="break-words font-medium">{wealthMoney(Number(total.liabilities), total.currency)}</dd></div><div><dt className={secondary}>Valuation quality</dt><dd>{total.missing_count} missing · {total.stale_count} stale</dd></div></dl>)}
      <ul className="divide-y divide-gray-100 dark:divide-gray-700">{snapshot.entries.map(entry => <li key={entry.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span className="min-w-0 break-words">{entry.name}<span className={`block ${secondary}`}>{entry.effective_kind === 'asset' ? wealthClassifications[entry.classification] : 'Liability'} · {entry.source === 'account' ? 'Tracked account balance' : `Manual · ${entry.valued_on || 'No valuation date'}`}</span></span><span className="break-words font-medium tabular-nums">{entry.amount === null ? 'Value missing' : wealthMoney(Number(entry.amount), entry.currency)}</span></li>)}</ul>
    </div></details>)}
  </section>
}

interface ViewProps {
  data: ReturnType<typeof useNetWorth>
  accounts: Account[]
  readOnly?: boolean
}

function NetWorthView({ data, accounts, readOnly = false }: ViewProps) {
  const [form, setForm] = useState<{ kind: WealthKind; entry?: CurrentWealthEntry } | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const snapshotId = useRef<string | null>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const totals = wealthTotals(data.entries)
  const open = (kind: WealthKind, element: HTMLButtonElement, entry?: CurrentWealthEntry) => { trigger.current = element; setForm({ kind, entry }) }
  const close = () => setForm(null)
  useEffect(() => { if (!form) trigger.current?.focus() }, [form])
  const action = async (work: () => Promise<void>, message: string) => {
    setBusy(true); setActionError(null); setNotice(null)
    try { await work(); setNotice(message) }
    catch (error) { setActionError(wealthError(error)) }
    finally { setBusy(false) }
  }

  if (data.loading && !data.entries.length && !data.error && !form) return <p role="status" className="min-h-48 py-8 text-gray-600 dark:text-gray-300">Loading your balance sheet…</p>
  if (data.error && !form) return <div role="alert" className="rounded-lg border border-red-200 bg-white p-5 dark:border-red-900 dark:bg-gray-800"><p className="text-sm text-red-800 dark:text-red-200">{data.error}</p><button type="button" disabled={data.loading} onClick={() => void data.refresh().catch(() => {})} className={`mt-3 ${button}`}>{data.loading ? 'Loading…' : 'Retry balance sheet'}</button></div>

  return <div className="space-y-7">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <p className={`max-w-2xl ${secondary}`}>{readOnly ? 'Sample property, investments and debts. Sign in to record your own balance sheet.' : 'Record what you own and owe. Include property, deposito, stocks and cash. Each currency stays separate.'}</p>
      {!readOnly && <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || data.loading} onClick={event => open('asset', event.currentTarget)} className="min-h-11 rounded-md bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 disabled:opacity-50">Add asset</button>
        <button type="button" disabled={busy || data.loading} onClick={event => open('liability', event.currentTarget)} className={button}>Add liability</button>
        <button type="button" disabled={busy || data.loading || !data.entries.length} onClick={() => {
          if (data.snapshots.some(item => item.id === snapshotId.current)) snapshotId.current = null
          snapshotId.current ||= crypto.randomUUID()
          void action(async () => { await data.capture(snapshotId.current!); snapshotId.current = null }, 'Snapshot saved. Earlier snapshots are unchanged.')
        }} className={button}>{busy ? 'Saving…' : 'Save snapshot'}</button>
        <button type="button" disabled={busy || data.loading} onClick={() => void action(data.refresh, 'Balances refreshed from your recorded data.')} className={button}>Refresh balances</button>
      </div>}
    </div>
    {actionError && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">{actionError}</p>}
    {notice && <p role="status" className={secondary}>{notice}</p>}
    {totals.length ? <div className="space-y-4">{totals.map(total => <Total key={total.currency} total={total} />)}</div> : <section className="rounded-xl border border-dashed border-gray-300 bg-white px-5 py-10 dark:border-gray-600 dark:bg-gray-800"><h2 className="text-lg font-semibold">Start your balance sheet</h2><p className={`mt-2 max-w-xl ${secondary}`}>Add your home, investments and other assets, then record any outstanding debts. Missing valuations stay visible until you can update them.</p></section>}
    {(['asset', 'liability'] as const).map(kind => {
      const entries = data.entries.filter(entry => entry.effective_kind === kind)
      return <section key={kind} aria-labelledby={`wealth-${kind}-title`}><h2 id={`wealth-${kind}-title`} className="mb-3 text-lg font-semibold">{kind === 'asset' ? 'Assets' : 'Liabilities'} <span className="text-sm font-normal text-gray-600 dark:text-gray-300">({entries.length})</span></h2>{!entries.length ? <p className={secondary}>No {kind === 'asset' ? 'assets' : 'liabilities'} recorded.</p> : <div className="divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white px-4 dark:divide-gray-700 dark:border-gray-700 dark:bg-gray-800 sm:px-5">{entries.map(entry => <article key={entry.id} aria-label={entry.name} className="py-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1 basis-48"><h3 className="break-words font-semibold">{entry.name}</h3><p className={`mt-1 ${secondary}`}>{wealthCategories[entry.category]}{kind === 'asset' ? ` · ${wealthClassifications[entry.classification]}` : ''}</p><p className={`mt-1 ${secondary}`}>{entry.source === 'account' ? `Tracked balance · ${entry.account_name}` : `Manual valuation · ${entry.valued_on || 'Date missing'}`}</p>{entry.goal_name && <p className={`mt-1 ${secondary}`}>Earmarked for {entry.goal_name} · counted once</p>}{entry.notes && <p className={`mt-2 break-words ${secondary}`}>{entry.notes}</p>}</div><div className="min-w-0"><p className="break-words text-lg font-semibold tabular-nums">{entry.amount === null ? 'Value missing' : wealthMoney(Number(entry.amount), entry.currency)}</p><p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{entry.currency}{entry.stale ? ' · Over 90 days old' : ''}</p>{!readOnly && <div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={busy || data.loading} onClick={event => open(entry.kind, event.currentTarget, entry)} aria-label={`Edit ${entry.name}`} className={button}>Edit</button><button type="button" disabled={busy || data.loading} onClick={() => void action(() => data.archive(entry.id, true), 'Entry archived. History retained; use Restore below to bring it back.')} aria-label={`Archive ${entry.name}`} className={button}>Archive</button></div>}</div></div>
        {entry.source === 'account' && <p className={`mt-3 ${secondary}`}>Recorded transactions only; opening holdings may be missing. {entry.kind === 'liability' ? 'The absolute tracked balance is treated as outstanding debt.' : kind === 'liability' ? 'The tracked account balance is negative.' : 'The linked balance replaces a manual valuation.'}</p>}
        <EntryHistory revisions={data.valuations.filter(item => item.entry_id === entry.id)} />
      </article>)}</div>}</section>
    })}
    <SnapshotHistory snapshots={data.snapshots} />
    {data.archived.length > 0 && <section><h2 className="mb-3 text-lg font-semibold">Archived entries</h2><div className="divide-y divide-gray-200 dark:divide-gray-700">{data.archived.map(entry => <article key={entry.id} className="py-3"><div className="flex flex-wrap items-center justify-between gap-3"><span className="min-w-0 break-words font-medium">{entry.name} · {entry.currency}</span><button type="button" disabled={busy || data.loading} onClick={() => void action(() => data.archive(entry.id, false), 'Entry restored.')} className={button} aria-label={`Restore ${entry.name}`}>Restore</button></div><EntryHistory revisions={data.valuations.filter(item => item.entry_id === entry.id)} /></article>)}</div></section>}
    {form && <WealthEntryForm entry={form.entry} kind={form.kind} accounts={accounts} goals={data.goals} onSave={async (input, revisionId) => { await data.save(input, revisionId); setNotice('Entry saved. Previous valuations and snapshots are retained.') }} onClose={close} />}
  </div>
}

export default function NetWorth({ userId, accounts }: { userId: string; accounts: Account[] }) {
  const data = useNetWorth(userId)
  return <NetWorthView data={data} accounts={accounts} />
}

export function DemoNetWorth() {
  const today = wealthToday()
  const make = (id: string, name: string, amount: number, kind: WealthKind, category: CurrentWealthEntry['category'], classification: CurrentWealthEntry['classification']): CurrentWealthEntry => ({ id, name, amount, kind, category, classification, user_id: 'demo', currency: 'IDR', account_id: null, goal_id: null, notes: null, archived: false, created_at: `${today}T00:00:00Z`, updated_at: `${today}T00:00:00Z`, revision_id: null, effective_kind: kind, valued_on: today, source: 'manual', missing_value: false, stale: false, account_name: null, goal_name: null })
  const entries = [make('home', 'Sample apartment', 1_000_000_000, 'asset', 'property', 'primary_residence'), make('deposit', 'Sample deposito', 100_000_000, 'asset', 'deposit', 'investable'), make('stocks', 'Sample stock portfolio', 50_000_000, 'asset', 'stocks', 'investable'), make('mortgage', 'Sample mortgage', 400_000_000, 'liability', 'mortgage', 'other')]
  const unused = async () => {}
  return <NetWorthView accounts={[]} readOnly data={{ entries, archived: [], valuations: [], snapshots: [], goals: [], loading: false, error: null, refresh: unused, save: unused, archive: unused, capture: unused }} />
}
