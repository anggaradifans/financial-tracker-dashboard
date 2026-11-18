import { forwardRef, useState } from 'react'
import type { ComponentPropsWithoutRef } from 'react'
import { Eye, EyeOff, LoaderCircle } from 'lucide-react'
import { authFocus, authInput, authPrimary } from './AuthLayout'

interface PasswordFieldProps extends Omit<ComponentPropsWithoutRef<'input'>, 'type' | 'className'> {
  id: string
  label: string
  revealLabel?: string
}

export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(function PasswordField(
  { id, label, revealLabel = 'password', ...inputProps }, ref,
) {
  const [visible, setVisible] = useState(false)
  const Icon = visible ? EyeOff : Eye

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">{label}</label>
      <div className="relative">
        <input ref={ref} {...inputProps} id={id} type={visible ? 'text' : 'password'} className={`${authInput} pr-14 aria-invalid:border-red-300`} />
        <button
          type="button"
          onClick={() => setVisible(value => !value)}
          aria-label={`${visible ? 'Hide' : 'Show'} ${revealLabel}`}
          aria-controls={id}
          className={`absolute right-0.5 top-0.5 inline-flex h-11 w-11 items-center justify-center rounded-md text-slate-300 hover:bg-slate-800 hover:text-white ${authFocus}`}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
})

export function AuthSubmit({ label, pendingLabel, pending }: { label: string; pendingLabel: string; pending: boolean }) {
  return (
    <div>
      <button type="submit" aria-disabled={pending} aria-label={label} className={authPrimary}>
        {pending && <LoaderCircle className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />}
        {pending ? pendingLabel : label}
      </button>
      <span role="status" className="sr-only">{pending ? pendingLabel : ''}</span>
    </div>
  )
}
