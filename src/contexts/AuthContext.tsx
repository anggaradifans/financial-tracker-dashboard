import React, { createContext, useContext, useEffect, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { captureException } from '../lib/monitoring'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  error: string | null
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    try {
      // Get initial session
      supabase.auth.getSession().then(({ data: { session }, error: sessionError }) => {
        if (sessionError) throw sessionError
        setSession(session)
        setUser(session?.user ?? null)
        setError(null)
        setLoading(false)
      }).catch((sessionError: unknown) => {
        captureException(sessionError)
        setError('Unable to check your session. Please refresh and try again.')
        setLoading(false)
      })

      // Listen for auth changes
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
        setError(null)
        setLoading(false)
      })

      return () => {
        subscription.unsubscribe()
      }
    } catch (setupError) {
      captureException(setupError)
      setError('Unable to initialize authentication. Please refresh and try again.')
      setLoading(false)
    }
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const value = {
    user,
    session,
    loading,
    error,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
