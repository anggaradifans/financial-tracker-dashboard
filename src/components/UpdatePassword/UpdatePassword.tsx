import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import AuthLayout, { authErrorBox, authPrimary, authTextAction } from '../AuthFlow/AuthLayout'
import { AuthSubmit, PasswordField } from '../AuthFlow/AuthFields'

function hasUnresolvedCallback() {
  const query = new URLSearchParams(window.location.search)
  const fragment = new URLSearchParams(window.location.hash.slice(1))
  const callbackKeys = ['error', 'error_code', 'error_description', 'code', 'access_token']
  return callbackKeys.some(key => query.has(key) || fragment.has(key))
}

export default function UpdatePassword() {
  const { user } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [mismatch, setMismatch] = useState(false)
  const [invalidSession, setInvalidSession] = useState(false)
  const [updated, setUpdated] = useState(false)
  const confirmation = useRef<HTMLInputElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const linkUnavailable = !user || hasUnresolvedCallback() || invalidSession

  useEffect(() => {
    heading.current?.focus()
  }, [linkUnavailable, updated])

  useEffect(() => {
    if (mismatch) confirmation.current?.focus()
  }, [mismatch])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isLoading || updated || linkUnavailable) return

    const form = new FormData(event.currentTarget)
    const password = String(form.get('password') ?? '')
    setError('')
    if (password !== form.get('confirmPassword')) {
      setMismatch(true)
      return
    }

    setIsLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (!error) {
        setUpdated(true)
      } else if (error.status === 401 || error.code === 'session_not_found' || error.code === 'session_expired') {
        setInvalidSession(true)
      } else if (error.code === 'same_password') {
        setError('Choose a password different from your current one.')
      } else if (error.code === 'weak_password') {
        setError('Choose a stronger password. Try a longer password with a mix of characters.')
      } else {
        setError('Could not update your password. Please try again.')
      }
    } catch {
      setError('Could not update your password. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  if (updated) {
    return (
      <AuthLayout title="Password updated" description="Use your new password the next time you sign in." titleRef={heading}>
        <Link to="/dashboard" replace className={authPrimary}>Continue to dashboard</Link>
      </AuthLayout>
    )
  }

  if (linkUnavailable) {
    return (
      <AuthLayout title="Reset link unavailable" description="This link may have expired or already been used. Request a new link and open the latest email." titleRef={heading}>
        <Link to="/?view=reset" replace className={authPrimary}>Request a new link</Link>
        <Link to="/" replace className={`${authTextAction} mt-3`}>Back to Sign In</Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Set a new password" titleRef={heading}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" onChange={() => { setError(''); setMismatch(false) }}>
        <p role="alert" className={error ? authErrorBox : 'sr-only'}>{error}</p>
        {user.email && (
          <>
            <p className="break-words text-sm text-slate-300">For {user.email}</p>
            <input type="text" name="username" autoComplete="username" value={user.email} readOnly hidden />
          </>
        )}
        <div>
          <PasswordField id="password" name="password" label="New Password" autoComplete="new-password" minLength={6} required
            readOnly={isLoading} aria-describedby="password-hint" />
          <p id="password-hint" className="mt-2 text-sm text-slate-300">Use at least 6 characters.</p>
        </div>
        <div>
          <PasswordField ref={confirmation} id="confirmPassword" name="confirmPassword" label="Confirm Password" revealLabel="confirmation password"
            autoComplete="new-password" required readOnly={isLoading} aria-invalid={mismatch}
            aria-describedby={mismatch ? 'password-mismatch' : undefined} />
          {mismatch && <p id="password-mismatch" className="mt-2 text-sm text-red-200">The passwords don’t match. Re-enter your new password.</p>}
        </div>
        <AuthSubmit label="Update Password" pendingLabel="Updating password…" pending={isLoading} />
      </form>
    </AuthLayout>
  )
}
