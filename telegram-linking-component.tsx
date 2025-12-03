import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const TelegramLinkingComponent: React.FC = () => {
  const { user } = useAuth()
  const [telegramUserId, setTelegramUserId] = useState('')
  const [isLinking, setIsLinking] = useState(false)
  const [linkStatus, setLinkStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const handleLinkTelegram = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!user || !telegramUserId) {
      setMessage('Please provide a valid Telegram User ID')
      setLinkStatus('error')
      return
    }

    setIsLinking(true)
    setMessage('')

    try {
      // Call your Supabase Edge Function to link the user
      const { data, error } = await supabase.functions.invoke('link-telegram-user', {
        body: {
          app_user_id: user.id,
          telegram_user_id: parseInt(telegramUserId),
          // You can get these from your app's user profile
          telegram_username: user.user_metadata?.username,
          first_name: user.user_metadata?.first_name,
          last_name: user.user_metadata?.last_name
        }
      })

      if (error) {
        throw error
      }

      setMessage('Telegram account linked successfully! 🎉')
      setLinkStatus('success')
      setTelegramUserId('')
    } catch (error) {
      console.error('Error linking telegram:', error)
      setMessage('Failed to link Telegram account. Please try again.')
      setLinkStatus('error')
    } finally {
      setIsLinking(false)
    }
  }

  const getTelegramUserId = () => {
    // Instructions for user to get their Telegram User ID
    return (
      <div className="mt-4 p-4 bg-blue-50 rounded-lg">
        <h4 className="font-semibold text-blue-900 mb-2">How to get your Telegram User ID:</h4>
        <ol className="list-decimal list-inside text-sm text-blue-800 space-y-1">
          <li>Open Telegram and search for @userinfobot</li>
          <li>Start a chat with the bot</li>
          <li>Send any message to get your User ID</li>
          <li>Copy the number and paste it below</li>
        </ol>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto bg-white p-6 rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">Link Telegram Account</h2>
      
      <form onSubmit={handleLinkTelegram} className="space-y-4">
        <div>
          <label htmlFor="telegramUserId" className="block text-sm font-medium text-gray-700 mb-1">
            Telegram User ID
          </label>
          <input
            type="number"
            id="telegramUserId"
            value={telegramUserId}
            onChange={(e) => setTelegramUserId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Enter your Telegram User ID"
            required
          />
        </div>

        {getTelegramUserId()}

        <button
          type="submit"
          disabled={isLinking}
          className="w-full bg-primary-600 text-white py-2 px-4 rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLinking ? 'Linking...' : 'Link Telegram Account'}
        </button>
      </form>

      {message && (
        <div className={`mt-4 p-3 rounded-md ${
          linkStatus === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
        }`}>
          {message}
        </div>
      )}
    </div>
  )
}

export default TelegramLinkingComponent
