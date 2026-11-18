import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Check, Download, HardDrive, Menu, Moon, RefreshCw, ShieldCheck, Sun } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import DashboardNavigation from '../DashboardNavigation/DashboardNavigation'
import { megabytes, storageForecast, storageHealth, StorageStatus } from './storage'

const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-gray-300 px-3 text-sm font-medium hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:hover:bg-gray-700'
const panel = 'rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
const muted = 'text-sm text-gray-600 dark:text-gray-400'
const tablesPerPage = 10

export default function AdminStorage() {
  const { user } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [accessError, setAccessError] = useState('')
  const [accessAttempt, setAccessAttempt] = useState(0)
  const [status, setStatus] = useState<StorageStatus | null>(null)
  const [tablePage, setTablePage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState('')
  const [exportError, setExportError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuTrigger = useRef<HTMLButtonElement>(null)
  const closeMenu = () => { setMenuOpen(false); menuTrigger.current?.focus() }
  const refresh = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const { data, error: rpcError } = await supabase.rpc('admin_storage_status')
      if (rpcError) throw rpcError
      setStatus(data as StorageStatus)
      setTablePage(1)
    } catch { setError('Storage metrics could not be loaded. Check the admin storage migration and your connection, then retry.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => {
    let active = true
    setAllowed(null); setStatus(null); setAccessError('')
    Promise.resolve(supabase.rpc('is_storage_admin')).then(({ data, error: rpcError }) => {
      if (!active) return
      if (rpcError) {
        setAccessError(rpcError.code === 'PGRST202' || rpcError.code === '42883'
          ? 'Admin storage is not set up in this Supabase project. Apply the admin storage migration, then retry. Your account role does not need to be changed.'
          : 'Administrator access could not be checked. Check your connection and sign in again if your session has expired, then retry.')
        return
      }
      if (typeof data !== 'boolean') {
        setAccessError('The administrator check returned an unexpected response. Check the admin storage migration, then retry.')
        return
      }
      setAllowed(data)
      if (data) void refresh()
    }).catch(() => { if (active) setAccessError('Administrator access could not be checked. Check your connection, then retry.') })
    return () => { active = false }
  }, [user?.id, refresh, accessAttempt])

  const download = async () => {
    setExporting(true); setExportError(''); setExportMessage('')
    try {
      const { data, error: rpcError } = await supabase.rpc('admin_export_financial_records')
      if (rpcError) throw rpcError
      if (typeof data !== 'string') throw new Error('Unexpected export response. Retry the download.')
      const parsed = JSON.parse(data)
      if (parsed.format_version !== 1 || !Array.isArray(parsed.transactions)) throw new Error('Invalid export. Retry the download.')
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data))
      const checksum = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
      const blob = new Blob([JSON.stringify({ sha256: checksum, payload: data })], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url; link.download = `financial-records-${new Date().toISOString().slice(0, 10)}.json`
      document.body.append(link); link.click(); link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setExportMessage(`Download requested for ${parsed.transactions.length.toLocaleString()} transaction${parsed.transactions.length === 1 ? '' : 's'}. Confirm the file was saved; restore verification has not run.`)
    } catch (cause) { setExportError(cause instanceof Error ? cause.message : typeof (cause as { message?: string })?.message === 'string' ? (cause as { message: string }).message : 'Download failed. Check your connection and retry.') }
    finally { setExporting(false) }
  }
  const tableCount = status?.tables.length ?? 0
  const tablePageCount = Math.max(1, Math.ceil(tableCount / tablesPerPage))
  const currentTablePage = Math.min(tablePage, tablePageCount)
  const tableStart = (currentTablePage - 1) * tablesPerPage
  const visibleTables = status?.tables.slice(tableStart, tableStart + tablesPerPage) ?? []
  const forecast = status ? storageForecast(status.samples, status.database_bytes, status.limit_bytes) : null
  const percent = status ? status.database_bytes / status.limit_bytes * 100 : 0
  const urgent = status && (status.database_bytes >= 350_000_000 || (forecast?.daysRemaining !== null && forecast?.daysRemaining !== undefined && forecast.daysRemaining <= 30))

  return <div className="dashboard-page min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-white">
    <DashboardNavigation basePath="/dashboard" isOpen={menuOpen} onClose={closeMenu} showAdmin={allowed === true} />
    <a href="#admin-content" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:bg-white focus:p-3 focus:text-gray-900">Skip to content</a>
    <div className="lg:pl-64">
      <header className="flex min-h-16 items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 dark:border-gray-700 dark:bg-gray-800 lg:px-8">
        <button ref={menuTrigger} className={`${button} lg:hidden`} aria-label="Open navigation" aria-expanded={menuOpen} aria-controls="dashboard-navigation" onClick={() => setMenuOpen(true)}><Menu size={18} />Menu</button>
        <Link to="/dashboard" className="inline-flex min-h-11 items-center gap-2 text-sm text-gray-600 hover:text-primary-700 dark:text-gray-300"><ArrowLeft size={16} />Back to dashboard</Link>
        <button className={button} onClick={toggleTheme} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>{theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}</button>
      </header>
      <main id="admin-content" tabIndex={-1} className="mx-auto max-w-7xl space-y-6 px-4 py-6 lg:px-8 lg:py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Database storage</h1><p className={`mt-2 ${muted}`}>Keep your financial history within the Supabase Free plan.</p></div>
          {allowed && <button className={button} onClick={refresh} disabled={loading}><RefreshCw size={16} className={loading ? 'animate-spin motion-reduce:animate-none' : ''} />{loading ? 'Checking…' : 'Refresh usage'}</button>}
        </div>
        {accessError ? <section role="alert" className={`${panel} max-w-2xl p-6`}><h2 className="text-lg font-semibold">Unable to check administrator access</h2><p className={`mt-2 ${muted}`}>{accessError}</p><button type="button" className={`${button} mt-5`} onClick={() => setAccessAttempt(attempt => attempt + 1)}>Retry access check</button></section> : allowed === null ? <div role="status" className={`${panel} p-6`}>Checking administrator access…</div> : !allowed ? <section className={`${panel} max-w-2xl p-6`}><ShieldCheck className="mb-4 text-gray-500" /><h2 className="text-lg font-semibold">Administrator access required</h2><p className={`mt-2 ${muted}`}>This page contains project-wide storage information. Ask the project owner to grant your account the administrator role. If you already have access, confirm the admin storage migration is installed and reload.</p><Link to="/dashboard" className={`${button} mt-5`}>Return to dashboard</Link></section> : <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600 dark:text-gray-400"><span className="inline-flex items-center gap-2"><ShieldCheck size={16} />Administrator access · Project-wide metrics</span><span>{status ? `Checked ${new Date(status.measured_at).toLocaleString()}` : 'No measurement available'}</span></div>
          {error && <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">{error} {status && 'Showing the previous measurement.'}<button className="ml-2 min-h-11 underline" onClick={refresh} disabled={loading}>Retry</button></div>}
          {loading && !status && <div role="status" className={`${panel} space-y-5 p-6`}><p>Measuring database storage…</p><div className="h-4 rounded bg-gray-100 dark:bg-gray-700" /><div className="h-32 rounded bg-gray-100 dark:bg-gray-700" /></div>}
          {status && <>
            <section aria-labelledby="capacity-heading" className={`${panel} p-5 sm:p-6`}>
              <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="capacity-heading" className="flex items-center gap-2 text-lg font-semibold"><HardDrive size={20} />Capacity</h2><span className={`rounded-md px-2.5 py-1 text-sm font-medium ${urgent ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200' : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'}`}>{storageHealth(status.database_bytes)}</span></div>
              <p className="mt-5 text-xl font-semibold tabular-nums">{megabytes(status.database_bytes)} <span className="text-base font-normal text-gray-500 dark:text-gray-400">of {megabytes(status.limit_bytes)} used ({percent.toFixed(1)}%)</span></p>
              <div className="relative mt-4 h-4 overflow-hidden rounded bg-gray-100 dark:bg-gray-700" role="progressbar" aria-label="Database capacity used" aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100} aria-valuetext={`${percent.toFixed(1)} percent used`}>
                <div className={`h-full ${urgent ? 'bg-amber-500' : 'bg-primary-600'}`} style={{ width: `${Math.min(100, percent)}%` }} />
                {[70, 80, 90].map(n => <span key={n} className="absolute inset-y-0 w-px bg-gray-600 dark:bg-gray-200" style={{ left: `${n}%` }} />)}
              </div>
              <div className={`mt-3 flex flex-wrap justify-between gap-2 tabular-nums ${muted}`}><span>{megabytes(Math.max(0, status.limit_bytes - status.database_bytes))} remaining</span><span>350 MB warning · 400 MB prepare · 450 MB urgent</span></div>
              <p className={`mt-5 border-t border-gray-200 pt-4 dark:border-gray-700 ${muted}`}>{urgent ? 'Review the largest tables and prepare a verified archive before capacity runs out.' : 'No capacity threshold has been reached.'} Includes all databases in this project’s PostgreSQL instance; file storage is separate.</p>
            </section>
            <section aria-labelledby="growth-heading" className={`${panel} grid gap-6 p-5 sm:p-6 xl:grid-cols-[minmax(0,1fr)_230px]`}>
              <div className="min-w-0"><h2 id="growth-heading" className="text-lg font-semibold">Storage over time</h2><p className={`mt-1 ${muted}`}>Daily samples · last 90 days</p>
                {status.samples.length < 2 ? <div className="mt-5 flex min-h-48 flex-col justify-center rounded-lg bg-gray-50 p-5 dark:bg-gray-900"><p className="font-medium">Your first measurement is recorded.</p><p className={`mt-2 max-w-lg ${muted}`}>Return on another day or enable scheduled sampling to start seeing your growth trend.</p></div> : <div className="mt-5 h-52" aria-label="Database size trend in megabytes"><ResponsiveContainer width="100%" height="100%"><AreaChart data={status.samples.map(s => ({ day: s.day, MB: +(s.database_bytes / 1_000_000).toFixed(2) }))} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}><CartesianGrid vertical={false} stroke={theme === 'dark' ? '#374151' : '#e5e7eb'} /><XAxis dataKey="day" tickFormatter={day => day.slice(5)} tick={{ fill: theme === 'dark' ? '#9ca3af' : '#4b5563', fontSize: 12 }} minTickGap={35} /><YAxis width={44} tick={{ fill: theme === 'dark' ? '#9ca3af' : '#4b5563', fontSize: 12 }} /><Tooltip contentStyle={{ background: theme === 'dark' ? '#1f2937' : '#fff', color: theme === 'dark' ? '#fff' : '#111827', borderRadius: 8 }} /><Area type="linear" dataKey="MB" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.10} strokeWidth={2} isAnimationActive={false} /></AreaChart></ResponsiveContainer></div>}
              </div>
              <dl className="space-y-6 border-t border-gray-200 pt-5 dark:border-gray-700 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0"><div><dt className={muted}>Average daily change</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{forecast ? `${forecast.daily > 0 ? '+' : ''}${megabytes(forecast.daily)}` : 'Gathering history'}</dd></div><div><dt className={muted}>Estimated time to limit</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{forecast ? forecast.daysRemaining === null ? 'No growth observed' : `${forecast.daysRemaining} days` : 'Not enough data'}</dd></div><div><dt className={muted}>Sampling</dt><dd className="mt-1 text-sm">On page load and refresh</dd><dd className={`mt-2 ${muted}`}>Daily scheduling needs database setup. Estimates follow the observed trend.</dd></div></dl>
            </section>
            <section aria-labelledby="tables-heading" className={`${panel} overflow-hidden`}>
              <div className="p-5 sm:p-6"><h2 id="tables-heading" className="text-lg font-semibold">Where storage goes</h2><p className={`mt-1 ${muted}`}>Largest tables first. Row counts are estimates; totals include indexes.</p></div>
              <div className="overflow-x-auto"><table id="storage-tables" className="w-full table-fixed text-left text-sm sm:table-auto"><thead className="border-y border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"><tr><th scope="col" className="w-[64%] px-4 py-3 font-medium sm:w-auto sm:px-5">Table</th><th scope="col" className="hidden px-4 py-3 text-right font-medium sm:table-cell">Rows ≈</th><th scope="col" className="hidden px-4 py-3 text-right font-medium sm:table-cell">Indexes</th><th scope="col" className="px-4 py-3 text-right font-medium sm:px-5">Total size</th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-700">{visibleTables.map(t => <tr key={t.name}><th scope="row" className="break-words px-4 py-4 font-medium [overflow-wrap:anywhere] sm:px-5">{t.name}</th><td className="hidden whitespace-nowrap px-4 py-4 text-right tabular-nums sm:table-cell">{t.rows.toLocaleString()}</td><td className="hidden whitespace-nowrap px-4 py-4 text-right tabular-nums sm:table-cell">{megabytes(t.index_bytes)}</td><td className="whitespace-nowrap px-4 py-4 text-right font-medium tabular-nums sm:px-5">{megabytes(t.total_bytes)}</td></tr>)}</tbody></table></div>
              {tableCount > 0 && <div className="flex flex-col gap-3 border-t border-gray-200 px-4 py-3 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <p aria-live="polite" aria-atomic="true" className={`${muted} tabular-nums`}>Showing {tableStart + 1}–{Math.min(tableStart + tablesPerPage, tableCount)} of {tableCount} tables</p>
                <nav aria-label="Storage table pagination" className="flex items-center justify-between gap-3 sm:justify-end">
                  <button type="button" aria-controls="storage-tables" className={button} disabled={loading || currentTablePage === 1} onClick={() => setTablePage(currentTablePage - 1)}>Previous</button>
                  <span className="whitespace-nowrap text-sm tabular-nums">Page {currentTablePage} of {tablePageCount}</span>
                  <button type="button" aria-controls="storage-tables" className={button} disabled={loading || currentTablePage === tablePageCount} onClick={() => setTablePage(currentTablePage + 1)}>Next</button>
                </nav>
              </div>}
              {!status.tables.length && <p className={`p-6 ${muted}`}>No table measurements were returned. Refresh to try again.</p>}
              <p className={`border-t border-gray-200 p-5 dark:border-gray-700 ${muted}`}>Table sizes are from the current database. Other databases, system objects and schemas account for the difference from total usage.</p>
            </section>
          </>}
          <div className="grid gap-6 xl:grid-cols-2">
            <section aria-labelledby="alerts-heading" className={`${panel} p-5 sm:p-6`}><h2 id="alerts-heading" className="text-lg font-semibold">Capacity alerts</h2><p className={`mt-1 ${muted}`}>Thresholds apply to the entire project.</p><dl className="mt-5 divide-y divide-gray-100 dark:divide-gray-700">{[['Warning', '350 MB', 'Review storage growth'], ['Prepare archive', '400 MB', 'Export and verify older records'], ['Urgent action', '450 MB', 'Free capacity before the limit']].map(([name, value, description]) => <div key={name} className="flex justify-between gap-3 py-3"><div><dt className="text-sm font-medium">{name}</dt><dd className={`mt-1 ${muted}`}>{description}</dd></div><dd className="whitespace-nowrap text-sm font-semibold tabular-nums">{value}</dd></div>)}</dl><p className={`mt-4 ${muted}`}>Also review forecasts of 30 days or less. Alerts appear on this page; email and external notifications are not connected.</p></section>
            <section aria-labelledby="backup-heading" className={`${panel} p-5 sm:p-6`}><h2 id="backup-heading" className="text-lg font-semibold">Backups & archives</h2><p className={`mt-1 ${muted}`}>Download financial records before making changes.</p><div className="mt-5 flex items-center gap-2 text-sm"><span className="h-2 w-2 rounded-full bg-gray-400" />Automatic archiving is off</div><p className={`mt-3 ${muted}`}>JSON includes every transaction field, linked accounts and categories, plus a SHA-256 checksum. Contains all users’ financial records, including soft-deleted transactions. Store the file securely.</p><button className={`${button} mt-5 border-primary-600 bg-primary-600 text-white hover:bg-primary-700 dark:border-primary-500 dark:hover:bg-primary-700`} onClick={download} disabled={exporting}><Download size={16} />{exporting ? 'Preparing download…' : 'Download financial records'}</button><p className={`mt-3 ${muted}`}>Up to 10,000 transactions / 20 MB. This export excludes goals, budgets, authentication and database configuration. Use a PostgreSQL dump for full recovery.</p>{exportMessage && <p role="status" className="mt-4 flex items-start gap-2 text-sm text-emerald-800 dark:text-emerald-300"><Check size={18} className="shrink-0" />{exportMessage}</p>}{exportError && <p role="alert" className="mt-4 text-sm text-red-700 dark:text-red-300">{exportError}</p>}<p className={`mt-5 border-t border-gray-200 pt-4 dark:border-gray-700 ${muted}`}>Last verified restore: not recorded. Downloads never delete or move source records.</p></section>
          </div>
        </>}
      </main>
    </div>
  </div>
}
