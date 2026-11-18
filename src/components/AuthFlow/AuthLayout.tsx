import { WalletCards } from 'lucide-react'
import type { ReactNode, Ref } from 'react'

export const authInput = 'min-h-12 w-full rounded-lg border border-slate-500 bg-slate-950 px-3 text-base text-slate-50 caret-blue-300 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-300'
export const authFocus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-300'
export const authPrimary = `inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition-colors [&:not([aria-disabled=true])]:hover:bg-primary-700 [&:not([aria-disabled=true])]:active:bg-primary-900 aria-disabled:cursor-default aria-disabled:bg-slate-700 ${authFocus}`
export const authErrorBox = 'rounded-lg border border-red-400/60 bg-red-950 px-3 py-2.5 text-sm leading-5 text-red-100'
export const authSecondary = `inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-slate-500 px-4 py-2 text-sm font-medium text-slate-100 transition-colors hover:bg-slate-800 active:bg-slate-700 ${authFocus}`
export const authTextAction = `inline-flex min-h-11 items-center rounded text-sm font-medium text-blue-300 underline-offset-4 hover:text-blue-200 hover:underline ${authFocus}`

interface AuthLayoutProps {
  title: string
  description?: string
  titleRef?: Ref<HTMLHeadingElement>
  children: ReactNode
}

export default function AuthLayout({ title, description, titleRef, children }: AuthLayoutProps) {
  return (
    <main className="grid min-h-dvh place-items-center bg-slate-950 px-4 py-4 text-slate-100 selection:bg-blue-200 selection:text-slate-950 [color-scheme:dark] sm:py-10">
      <div className="w-full max-w-md">
        <div className="mb-4 flex items-center gap-2.5 px-1 sm:mb-5">
          <WalletCards className="h-6 w-6 text-blue-300" aria-hidden="true" />
          <span className="text-base font-semibold text-slate-100">Financial Tracker</span>
        </div>
        <section aria-labelledby="auth-heading" className="rounded-2xl border border-slate-700 bg-slate-900 p-5 sm:p-8">
          <div className="mb-5">
            <h1 id="auth-heading" ref={titleRef} tabIndex={titleRef ? -1 : undefined} className="rounded text-3xl font-semibold tracking-tight text-white focus:outline-none">
              {title}
            </h1>
            {description && <p className="mt-2 text-sm leading-6 text-slate-300">{description}</p>}
          </div>
          {children}
        </section>
      </div>
    </main>
  )
}
