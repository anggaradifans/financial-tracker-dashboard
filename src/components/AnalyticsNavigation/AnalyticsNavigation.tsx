import { useEffect, useRef } from 'react'
import { NavLink } from 'react-router-dom'

const views = [
  { path: '', label: 'Cash flow' },
  { path: '/spending', label: 'Spending' },
  { path: '/savings-preview', label: 'Savings preview' },
] as const

export type AnalyticsView = typeof views[number]['path']

export function getAnalyticsView(pathname: string, basePath: string): AnalyticsView {
  return views.find(({ path }) => pathname.replace(/\/$/, '') === `${basePath}/analytics${path}`)?.path ?? ''
}

export default function AnalyticsNavigation({ basePath, view }: { basePath: string; view: AnalyticsView }) {
  const nav = useRef<HTMLElement>(null)
  const previousView = useRef(view)

  useEffect(() => {
    if (previousView.current === view) return
    previousView.current = view
    nav.current?.scrollIntoView({ block: 'start' })
    nav.current?.querySelector<HTMLAnchorElement>('[aria-current="page"]')?.focus({ preventScroll: true })
  }, [view])

  return <nav ref={nav} aria-label="Analytics subsections" className="flex scroll-mt-20 flex-wrap gap-x-2 border-b border-gray-200 dark:border-gray-700">
    {views.map(({ path, label }) => <NavLink
      key={path}
      end
      to={`${basePath}/analytics${path}`}
      className={({ isActive }) => `inline-flex min-h-11 items-center border-b-2 px-2 text-sm font-medium sm:px-3 ${isActive
        ? 'border-primary-600 text-primary-700 dark:border-primary-400 dark:text-blue-300'
        : 'border-transparent text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'}`}
    >{label}</NavLink>)}
  </nav>
}
