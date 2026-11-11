import React, { useEffect, useRef } from 'react'
import { NavLink } from 'react-router-dom'
import { BarChart3, LayoutDashboard, ReceiptText, Scale, Settings, Target, WalletCards, X } from 'lucide-react'

export type DashboardSection = 'overview' | 'transactions' | 'analytics' | 'budgets' | 'goals' | 'net-worth' | 'settings'

interface DashboardNavigationProps {
  basePath: '/dashboard' | '/demo'
  isOpen: boolean
  onClose: () => void
  mobileActions?: React.ReactNode
}

const sections: Array<{ id: DashboardSection; label: string; Icon: React.ElementType }> = [
  { id: 'overview', label: 'Overview', Icon: LayoutDashboard },
  { id: 'transactions', label: 'Transactions', Icon: ReceiptText },
  { id: 'analytics', label: 'Analytics', Icon: BarChart3 },
  { id: 'budgets', label: 'Budgets', Icon: WalletCards },
  { id: 'goals', label: 'Goals', Icon: Target },
  { id: 'net-worth', label: 'Net worth', Icon: Scale },
  { id: 'settings', label: 'Settings', Icon: Settings },
]

export const getDashboardSection = (pathname: string, basePath: '/dashboard' | '/demo'): DashboardSection => {
  const segment = pathname.replace(`${basePath}/`, '').replace(/\/$/, '')
  if (segment === 'analytics/spending' || segment === 'analytics/savings-preview') return 'analytics'
  if (basePath === '/dashboard' && segment === 'goals/financial-freedom') return 'goals'
  return sections.some(section => section.id === segment) ? segment as DashboardSection : 'overview'
}

const DashboardNavigation: React.FC<DashboardNavigationProps> = ({ basePath, isOpen, onClose, mobileActions }) => {
  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (isOpen) closeButton.current?.focus()
  }, [isOpen])

  return (
    <>
      {isOpen && <div aria-hidden="true" onClick={onClose} className="fixed inset-0 z-40 bg-gray-950/40 lg:hidden" />}
      <aside id="dashboard-navigation" aria-label="Dashboard navigation" onKeyDown={event => {
        if (!isOpen || !closeButton.current?.getClientRects().length) return
        if (event.key === 'Escape') {
          onClose()
        } else if (event.key === 'Tab') {
          const items = event.currentTarget.querySelectorAll<HTMLElement>('button, a[href]')
          const first = items[0]
          const last = items[items.length - 1]
          if (event.shiftKey && event.target === first) {
            event.preventDefault()
            last?.focus()
          } else if (!event.shiftKey && event.target === last) {
            event.preventDefault()
            first?.focus()
          }
        }
      }} className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col overflow-y-auto border-r border-gray-200 bg-white p-4 transition-transform dark:border-gray-700 dark:bg-gray-800 lg:visible lg:translate-x-0 ${isOpen ? 'visible translate-x-0 shadow-xl' : 'invisible -translate-x-full'}`}>
        <div className="mb-8 flex items-center justify-between px-2">
          <div>
            <p className="text-base font-semibold text-gray-900 dark:text-white">Financial Tracker</p>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Personal finance</p>
          </div>
          <button ref={closeButton} type="button" aria-label="Close navigation" onClick={onClose} className="rounded-md p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 lg:hidden">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <nav className="space-y-1">
          {sections.map(({ id, label, Icon }) => {
            const to = id === 'overview' ? basePath : `${basePath}/${id}`
            return (
              <NavLink key={id} to={to} end={id === 'overview'} onClick={onClose} className={({ isActive }) => `flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors ${isActive ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'}`}>
                <Icon className="h-5 w-5" aria-hidden="true" />
                {label}
              </NavLink>
            )
          })}
        </nav>
        {mobileActions && <div className="mt-4 space-y-1 border-t border-gray-200 pt-4 dark:border-gray-700 lg:hidden">{mobileActions}</div>}
      </aside>
    </>
  )
}

export default DashboardNavigation
