import React, { useState } from 'react'
import LoginForm from '../LoginForm'
import RegistrationForm from '../RegistrationForm'
import ForgotPasswordForm from './ForgotPasswordForm'

const AuthFlow: React.FC = () => {
  const [view, setView] = useState<'login' | 'register' | 'forgot-password'>('login')

  return (
    <>
      {view === 'login' && (
        <LoginForm 
          onSwitchToRegister={() => setView('register')} 
          onSwitchToForgotPassword={() => setView('forgot-password')}
        />
      )}
      {view === 'register' && (
        <RegistrationForm onSwitchToLogin={() => setView('login')} />
      )}
      {view === 'forgot-password' && (
        <ForgotPasswordForm onSwitchToLogin={() => setView('login')} />
      )}
    </>
  )
}

export default AuthFlow

