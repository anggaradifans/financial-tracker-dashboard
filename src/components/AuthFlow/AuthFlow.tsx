import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import LoginForm from '../LoginForm'
import RegistrationForm from '../RegistrationForm'
import ForgotPasswordForm from './ForgotPasswordForm'

const passwordResetPath = '/?view=reset'

export default function AuthFlow() {
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const view = search.get('view')
  const [email, setEmail] = useState('')
  const [focusLoginEmail, setFocusLoginEmail] = useState(view === 'reset')

  const returnToLogin = (address: string) => {
    setEmail(address)
    setFocusLoginEmail(true)
    navigate('/', { replace: true })
  }

  if (view === 'register') {
    return <RegistrationForm initialEmail={email} onSwitchToLogin={returnToLogin} />
  }

  if (view === 'reset') {
    return <ForgotPasswordForm email={email} onEmailChange={setEmail} onSwitchToLogin={returnToLogin} />
  }

  return (
    <LoginForm
      initialEmail={email}
      focusEmail={focusLoginEmail}
      onSwitchToRegister={address => {
        setEmail(address)
        setFocusLoginEmail(true)
        navigate('/?view=register')
      }}
      onSwitchToForgotPassword={address => {
        setEmail(address)
        setFocusLoginEmail(true)
        navigate(passwordResetPath)
      }}
    />
  )
}
