import React from 'react'
import { AlertCircle, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const DemoBanner: React.FC = () => {
  const navigate = useNavigate()

  return (
    <div className="bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800 px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              <span className="font-bold">DEMO MODE</span> - You're viewing sample data. 
              <button
                onClick={() => navigate('/')}
                className="ml-2 underline hover:text-yellow-900 dark:hover:text-yellow-100 font-semibold"
              >
                Sign in to use your real data
              </button>
            </p>
            <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
              Changes you make here won't be saved. This is a preview of the application.
            </p>
          </div>
        </div>
        <button
          onClick={() => navigate('/')}
          className="text-yellow-600 dark:text-yellow-400 hover:text-yellow-800 dark:hover:text-yellow-200 transition-colors"
          aria-label="Close demo mode"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}

export default DemoBanner

