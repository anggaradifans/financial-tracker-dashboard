// Example Supabase Edge Function for Telegram Webhook
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TelegramUser {
  id: number
  is_bot: boolean
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
}

interface TelegramMessage {
  message_id: number
  from: TelegramUser
  chat: {
    id: number
    type: string
  }
  text?: string
  date: number
}

interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  callback_query?: {
    from: TelegramUser
    data?: string
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Parse Telegram webhook data
    const update: TelegramUpdate = await req.json()
    
    // Get Telegram user info
    const telegramUser = update.message?.from || update.callback_query?.from
    if (!telegramUser) {
      return new Response('No user data', { status: 400 })
    }

    // Method 1: Check if Telegram user is linked to app user
    const { data: linkedUser, error: linkError } = await supabaseClient
      .rpc('get_user_by_telegram_id', { telegram_id: telegramUser.id })

    if (linkError) {
      console.error('Error checking telegram link:', linkError)
      return new Response('Database error', { status: 500 })
    }

    if (linkedUser && linkedUser.length > 0) {
      // User is linked - proceed with authenticated operations
      const appUserId = linkedUser[0].user_id
      
      // Example: Get user's transactions
      const { data: transactions, error: transError } = await supabaseClient
        .from('transactions')
        .select('*')
        .eq('user_id', appUserId)
        .order('created_at', { ascending: false })
        .limit(10)

      if (transError) {
        console.error('Error fetching transactions:', transError)
        return new Response('Database error', { status: 500 })
      }

      // Send response back to Telegram
      const responseText = transactions.length > 0 
        ? `Your recent transactions:\n${transactions.map(t => `• ${t.type}: ${t.amount} ${t.currency}`).join('\n')}`
        : 'No transactions found.'

      // Send message back to Telegram (you'd use Telegram Bot API here)
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Data retrieved successfully',
        user_id: appUserId,
        transactions_count: transactions.length
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })

    } else {
      // User not linked - send linking instructions
      const responseText = `Hi ${telegramUser.first_name}! 👋\n\nTo use this bot, you need to link your Telegram account to your app account.\n\nPlease visit our app and use the "Link Telegram" feature.`
      
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'User not linked',
        instructions: responseText
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

  } catch (error) {
    console.error('Webhook error:', error)
    return new Response('Internal server error', { status: 500 })
  }
})

// Alternative approach: Link users via verification code
export async function linkTelegramUser(
  supabaseClient: any,
  appUserId: string,
  telegramUserId: number,
  telegramUsername?: string,
  firstName?: string,
  lastName?: string
) {
  const { data, error } = await supabaseClient
    .rpc('link_telegram_user', {
      app_user_id: appUserId,
      telegram_id: telegramUserId,
      telegram_username: telegramUsername,
      first_name: firstName,
      last_name: lastName
    })

  if (error) {
    console.error('Error linking telegram user:', error)
    return { success: false, error }
  }

  return { success: true, data }
}

// Method to verify user identity via Telegram
export async function verifyTelegramUser(
  supabaseClient: any,
  telegramUserId: number
) {
  const { data, error } = await supabaseClient
    .rpc('get_user_by_telegram_id', { telegram_id: telegramUserId })

  if (error) {
    return { success: false, error }
  }

  return { 
    success: true, 
    isLinked: data && data.length > 0,
    userData: data?.[0] || null
  }
}
