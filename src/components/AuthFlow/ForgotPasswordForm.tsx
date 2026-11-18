import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import AuthLayout, { authInput, authSecondary, authTextAction } from './AuthLayout'
import { AuthSubmit } from './AuthFields'

interface ForgotPasswordFormProps {
  email: string
  onEmailChange: (email: string) => void
  onSwitchToLogin: (email: string) => void
}

export default function ForgotPasswordForm({ email, onEmailChange, onSwitchToLogin }: ForgotPasswordFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [sentEmail, setSentEmail] = useState<string | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const emailInput = useRef<HTMLInputElement>(null)
  const requestAnother = useRef<HTMLButtonElement>(null)
  const sent = sentEmail === email.trim()

  useEffect(() => {
    heading.current?.focus()
  }, [])

  useEffect(() => {
    if (sent) requestAnother.current?.focus()
  }, [sent])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isLoading || sent) return

    const address = emailInput.current?.value.trim() ?? ''
    if (!address) return

    onEmailChange(address)
    setIsLoading(true)
    try {
      await supabase.auth.resetPasswordForEmail(address, {
        redirectTo: `${window.location.origin}/update-password`,
      })
    } catch {
      // Keep failed and successful requests indistinguishable to callers.
    } finally {
      setSentEmail(address)
      setIsLoading(false)
    }
  }

  return (
    <AuthLayout title="Reset your password" description="Enter your email address to request a reset link." titleRef={heading}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium">Email Address</label>
          <input ref={emailInput} id="email" name="email" type="email" autoComplete="email" required readOnly={isLoading}
            value={email} onChange={event => onEmailChange(event.target.value)} className={authInput} />
        </div>
        <div role="status" className={sent ? 'rounded-lg border border-slate-500 bg-slate-800 px-3 py-2.5 text-sm leading-5 text-slate-100' : 'sr-only'}>
          {sent && 'If an account exists for this email, a password reset link will be sent. Check your inbox and spam folder.'}
        </div>
        {sent ? (
          <button ref={requestAnother} type="button" className={authSecondary} onClick={() => { setSentEmail(null); emailInput.current?.focus() }}>
            Request another link
          </button>
        ) : (
          <AuthSubmit label="Send Reset Link" pendingLabel="Sending reset link…" pending={isLoading} />
        )}
      </form>
      <button type="button" onClick={() => onSwitchToLogin(emailInput.current?.value.trim() ?? email.trim())} className={`${authTextAction} mt-3 gap-2`}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />Back to Login
      </button>
    </AuthLayout>
  )
}
