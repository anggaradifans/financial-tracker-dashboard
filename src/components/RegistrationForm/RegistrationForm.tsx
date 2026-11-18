import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import AuthLayout, { authErrorBox, authInput, authPrimary, authTextAction } from '../AuthFlow/AuthLayout'
import { AuthSubmit, PasswordField } from '../AuthFlow/AuthFields'

interface RegistrationFormProps {
  initialEmail?: string
  onSwitchToLogin?: (email: string) => void
}

export default function RegistrationForm({ initialEmail = '', onSwitchToLogin }: RegistrationFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [registeredEmail, setRegisteredEmail] = useState('')
  const [error, setError] = useState('')
  const [mismatch, setMismatch] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const emailInput = useRef<HTMLInputElement>(null)
  const firstNameInput = useRef<HTMLInputElement>(null)
  const lastNameInput = useRef<HTMLInputElement>(null)
  const confirmation = useRef<HTMLInputElement>(null)

  useEffect(() => {
    heading.current?.focus()
  }, [registeredEmail])

  useEffect(() => {
    if (mismatch) confirmation.current?.focus()
  }, [mismatch])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isLoading || registeredEmail) return

    const form = new FormData(event.currentTarget)
    const firstName = String(form.get('firstName') ?? '').trim()
    const lastName = String(form.get('lastName') ?? '').trim()
    const email = String(form.get('email') ?? '').trim()
    const password = String(form.get('password') ?? '')
    setError('')
    if (!firstName || !lastName) {
      setError(firstName ? 'Enter your last name.' : 'Enter your first name.')
      const missingName = firstName ? lastNameInput : firstNameInput
      missingName.current?.focus()
      return
    }
    if (password !== form.get('confirmPassword')) {
      setMismatch(true)
      return
    }

    setIsLoading(true)
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { first_name: firstName, last_name: lastName } },
      })
      if (!error) {
        setRegisteredEmail(email)
      } else if (error.code === 'weak_password') {
        setError('Choose a stronger password. Try a longer password with a mix of characters.')
      } else if (error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit') {
        setError('Too many attempts. Wait a moment and try again.')
      } else {
        setError('Could not create your account. Check your details and try again.')
      }
    } catch {
      setError('Could not create your account. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  if (registeredEmail) {
    return (
      <AuthLayout title="Check your email" description="Open the confirmation link to finish setting up your account. If it hasn’t arrived, check your spam folder." titleRef={heading}>
        {onSwitchToLogin && <button type="button" onClick={() => onSwitchToLogin(registeredEmail)} className={authPrimary}>Back to Sign In</button>}
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Create an account" titleRef={heading}>
      <form onSubmit={handleSubmit} onChange={() => { setError(''); setMismatch(false) }} className="flex flex-col gap-4">
        <p role="alert" className={error ? authErrorBox : 'sr-only'}>{error}</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <label htmlFor="firstName" className="mb-1.5 block text-sm font-medium">First Name</label>
            <input ref={firstNameInput} id="firstName" name="firstName" autoComplete="given-name" required readOnly={isLoading} className={authInput} />
          </div>
          <div className="min-w-0">
            <label htmlFor="lastName" className="mb-1.5 block text-sm font-medium">Last Name</label>
            <input ref={lastNameInput} id="lastName" name="lastName" autoComplete="family-name" required readOnly={isLoading} className={authInput} />
          </div>
        </div>
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium">Email Address</label>
          <input ref={emailInput} id="email" name="email" type="email" autoComplete="username" required readOnly={isLoading} defaultValue={initialEmail} className={authInput} />
        </div>
        <div>
          <PasswordField id="password" name="password" label="Password" autoComplete="new-password" minLength={6} required
            readOnly={isLoading} aria-describedby="password-hint" />
          <p id="password-hint" className="mt-2 text-sm text-slate-300">Use at least 6 characters.</p>
        </div>
        <div>
          <PasswordField ref={confirmation} id="confirmPassword" name="confirmPassword" label="Confirm Password" revealLabel="confirmation password"
            autoComplete="new-password" required readOnly={isLoading} aria-invalid={mismatch}
            aria-describedby={mismatch ? 'password-mismatch' : undefined} />
          {mismatch && <p id="password-mismatch" className="mt-2 text-sm text-red-200">The passwords don’t match. Re-enter your password.</p>}
        </div>
        <AuthSubmit label="Create Account" pendingLabel="Creating account…" pending={isLoading} />
      </form>
      {onSwitchToLogin && (
        <p className="mt-4 flex flex-wrap items-center gap-x-2 border-t border-slate-700 pt-3 text-sm text-slate-300">
          Already have an account?
          <button type="button" onClick={() => onSwitchToLogin(emailInput.current?.value.trim() ?? '')} className={authTextAction}>Sign in</button>
        </p>
      )}
    </AuthLayout>
  )
}
