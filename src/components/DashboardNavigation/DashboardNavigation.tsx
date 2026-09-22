import React from 'react'
import { NavLink } from 'react-router-dom'
import { BarChart3, LayoutDashboard, ReceiptText, Settings, WalletCards, X } from 'lucide-react'

export type DashboardSection = 'overview' | 'transactions' | 'analytics' | 'budgets' | 'settings'

interface DashboardNavigationProps {
  basePath: '/dashboard' | '/demo'
  isOpen: boolean
  onClose: () => void
}

const sections: Array<{ id: DashboardSection; label: string; Icon: React.ElementType }> = [
  { id: 'overview', label: 'Overview', Icon: LayoutDashboard },
  { id: 'transactions', label: 'Transactions', Icon: ReceiptText },
  { id: 'analytics', label: 'Analytics', Icon: BarChart3 },
  { id: 'budgets', label: 'Budgets', Icon: WalletCards },
  { id: 'settings', label: 'Settings', Icon: Settings },
]

export const getDashboardSection = (pathname: string, basePath: '/dashboard' | '/demo'): DashboardSection => {
  const segment = pathname.replace(`${basePath}/`, '')
  return sections.some(section => section.id === segment) ? segment as DashboardSection : 'overview'
}

const DashboardNavigation: React.FC<DashboardNavigationProps> = ({ basePath, isOpen, onClose }) => {
  return (
    <>
      {isOpen && <button type="button" aria-label="Close navigation" onClick={onClose} className="fixed inset-0 z-40 bg-gray-950/40 lg:hidden" />}
      <aside aria-label="Dashboard navigation" className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-gray-200 bg-white p-4 transition-transform dark:border-gray-700 dark:bg-gray-800 lg:translate-x-0 ${isOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full'}`}>
        <div className="mb-8 flex items-center justify-between px-2">
          <div>
            <p className="text-base font-semibold text-gray-900 dark:text-white">Financial Tracker</p>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Personal finance</p>
          </div>
          <button type="button" aria-label="Close navigation" onClick={onClose} className="rounded-md p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 lg:hidden">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <nav className="space-y-1">
          {sections.map(({ id, label, Icon }) => {
            const to = id === 'overview' ? basePath : `${basePath}/${id}`
            return (
              <NavLink key={id} to={to} end={id === 'overview'} onClick={onClose} className={({ isActive }) => `flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors ${isActive ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'}`}>
                <Icon className="h-5 w-5" aria-hidden="true" />
                {label}
              </NavLink>
            )
          })}
        </nav>
      </aside>
    </>
  )
}

export default DashboardNavigation
