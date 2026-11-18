import { BrowserRouter, Routes, Route, Navigate, useSearchParams } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import Dashboard from './components/Dashboard'
import DemoDashboard from './components/DemoDashboard'
import AuthFlow from './components/AuthFlow'
import UpdatePassword from './components/UpdatePassword/UpdatePassword'
import './App.css'
import { LoadingIndicator } from './components/LoadingIndicator'

const AppContent = () => {
  const { user, loading, error: authError } = useAuth()
  const [search] = useSearchParams()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center transition-colors">
        <LoadingIndicator size="lg" label="Loading your dashboard…" />
      </div>
    )
  }

  return (
    <>
      {authError && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-red-700 px-4 py-3 text-center text-sm text-white" role="alert">
          {authError}
        </div>
      )}
      <Routes>
      {/* Demo route - accessible without authentication */}
      <Route path="/demo/*" element={<DemoDashboard />} />
      
      {/* Protected routes */}
      <Route
        path="/dashboard/*"
        element={user ? <Dashboard key={user.id} /> : <Navigate to="/" replace />}
      />
      
      {/* Auth routes */}
      <Route
        path="/"
        element={user && search.get('view') !== 'reset' ? <Navigate to="/dashboard" replace /> : <AuthFlow />}
      />

      <Route
        path="/update-password"
        element={<UpdatePassword />}
      />
      
      {/* Catch all - redirect to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App
