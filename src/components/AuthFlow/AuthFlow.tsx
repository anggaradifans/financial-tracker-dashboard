import React, { useState } from 'react'
import LoginForm from '../LoginForm'
import RegistrationForm from '../RegistrationForm'

const AuthFlow: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true)

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center p-4">
      {isLogin ? (
        <LoginForm onSwitchToRegister={() => setIsLogin(false)} />
      ) : (
        <RegistrationForm onSwitchToLogin={() => setIsLogin(true)} />
      )}
    </div>
  )
}

export default AuthFlow

