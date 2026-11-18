import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import AuthLayout, { authErrorBox, authInput, authSecondary, authTextAction } from '../AuthFlow/AuthLayout'
import { AuthSubmit, PasswordField } from '../AuthFlow/AuthFields'

interface LoginFormProps {
  initialEmail?: string
  focusEmail?: boolean
  onSwitchToRegister: (email: string) => void
  onSwitchToForgotPassword: (email: string) => void
}

const fallbackError = 'Could not sign in. Please try again.'

export default function LoginForm({ initialEmail = '', focusEmail = false, onSwitchToRegister, onSwitchToForgotPassword }: LoginFormProps) {
  const [errorMessage, setErrorMessage] = useState('')
  const [showResetAction, setShowResetAction] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const emailInput = useRef<HTMLInputElement>(null)
  const currentEmail = () => emailInput.current?.value.trim() ?? ''
  const resetPassword = () => onSwitchToForgotPassword(currentEmail())

  const clearError = () => {
    setErrorMessage('')
    setShowResetAction(false)
  }

  useEffect(() => {
    if (focusEmail) emailInput.current?.focus()
  }, [focusEmail])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isLoading) return

    const form = new FormData(event.currentTarget)
    setIsLoading(true)
    clearError()
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: currentEmail(), password: String(form.get('password') ?? '') })
      if (!error) return

      switch (error.code) {
        case 'invalid_credentials':
          setErrorMessage('Email or password is incorrect. Check your details and try again.')
          setShowResetAction(true)
          break
        case 'email_not_confirmed':
          setErrorMessage('Confirm your email using the link in your inbox, then sign in again.')
          break
        case 'over_request_rate_limit':
          setErrorMessage('Too many sign-in attempts. Wait a moment and try again.')
          break
        default:
          setErrorMessage(fallbackError)
      }
    } catch {
      setErrorMessage(fallbackError)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthLayout title="Sign in">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className={errorMessage ? authErrorBox : 'sr-only'}>
          <p role="alert">{errorMessage}</p>
          {showResetAction && <button type="button" onClick={resetPassword} className={authTextAction}>Reset password</button>}
        </div>
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium">Email Address</label>
          <input
            ref={emailInput}
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            readOnly={isLoading}
            defaultValue={initialEmail}
            onChange={clearError}
            className={authInput}
          />
        </div>
        <div>
          <PasswordField id="password" name="password" label="Password" autoComplete="current-password" required readOnly={isLoading} onChange={clearError} />
          <div className="flex justify-end">
            <button type="button" onClick={resetPassword} className={authTextAction}>
              Forgot password?
            </button>
          </div>
        </div>
        <AuthSubmit label="Sign In" pendingLabel="Signing in…" pending={isLoading} />
      </form>

      <div className="mt-5 border-t border-slate-700 pt-4">
        <p className="mb-1 flex flex-wrap items-center gap-x-2 text-sm text-slate-300">
          New to Financial Tracker?
          <button type="button" onClick={() => onSwitchToRegister(currentEmail())} className={authTextAction}>Sign up</button>
        </p>
        <Link to="/demo" className={authSecondary}>Try the demo</Link>
      </div>
    </AuthLayout>
  )
}
