// Direct Supabase REST API client (no library dependency)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseServiceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing Supabase environment variables (VITE_SUPABASE_URL and VITE_SUPABASE_SERVICE_ROLE_KEY required)')
}

const REST_URL = `${supabaseUrl}/rest/v1`

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: any
  headers?: Record<string, string>
  query?: Record<string, string>
}

export const supabaseRest = {
  async request<T = any>(
    table: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const { method = 'GET', body, headers = {}, query } = options

    // Build URL with query parameters
    // PostgREST supports multiple filters on the same column via multiple query params
    const url = new URL(`${REST_URL}/${table}`)
    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        // If value is an array, append multiple times (for multiple filters on same column)
        if (Array.isArray(value)) {
          value.forEach(v => url.searchParams.append(key, v))
        } else {
          url.searchParams.append(key, value)
        }
      })
    }

    const response = await fetch(url.toString(), {
      method,
      headers: {
        'apikey': supabaseServiceRoleKey,
        'Authorization': `Bearer ${supabaseServiceRoleKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!response.ok) {
      const errorData = await response.text()
      throw new Error(`Supabase API error: ${response.status} - ${errorData}`)
    }

    const data = await response.json()
    return data as T
  },

  // Helper methods for common operations
  async select<T = any>(
    table: string,
    query?: {
      select?: string
      eq?: Record<string, any>
      gte?: Record<string, string>
      lte?: Record<string, string>
      is?: Record<string, any>
      order?: string
      limit?: number
    }
  ): Promise<T[]> {
    // PostgREST supports multiple query params with same key (for range queries)
    // We'll build the URL directly to support multiple values for same key
    const url = new URL(`${REST_URL}/${table}`)

    // Build select query
    if (query?.select) {
      url.searchParams.set('select', query.select)
    }

    // Build filter queries (PostgREST format: ?column=operator.value)
    // For multiple operators on same column, use multiple params with same key
    if (query?.eq) {
      Object.entries(query.eq).forEach(([key, value]) => {
        url.searchParams.append(key, `eq.${value}`)
      })
    }

    if (query?.gte) {
      Object.entries(query.gte).forEach(([key, value]) => {
        url.searchParams.append(key, `gte.${value}`)
      })
    }

    if (query?.lte) {
      Object.entries(query.lte).forEach(([key, value]) => {
        url.searchParams.append(key, `lte.${value}`)
      })
    }

    if (query?.is) {
      Object.entries(query.is).forEach(([key, value]) => {
        // For "is null" use is.null, for other values use is.value
        url.searchParams.set(key, value === null ? 'is.null' : `is.${value}`)
      })
    }

    if (query?.order) {
      // Format: order=column.desc or order=column.asc
      const orderValue = query.order.includes('.') ? query.order : `${query.order}.asc`
      url.searchParams.set('order', orderValue)
    }

    if (query?.limit) {
      url.searchParams.set('limit', query.limit.toString())
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'apikey': supabaseServiceRoleKey,
        'Authorization': `Bearer ${supabaseServiceRoleKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
    })

    if (!response.ok) {
      const errorData = await response.text()
      throw new Error(`Supabase API error: ${response.status} - ${errorData}`)
    }

    const data = await response.json()
    return data as T[]
  },

  async insert<T = any>(table: string, data: any): Promise<T> {
    return this.request<T>(table, {
      method: 'POST',
      body: data,
    })
  },

  async update<T = any>(
    table: string,
    data: any,
    eq?: Record<string, any>
  ): Promise<T> {
    const query: Record<string, string> = {}
    if (eq) {
      Object.entries(eq).forEach(([key, value]) => {
        query[key] = `eq.${value}`
      })
    }

    return this.request<T>(table, {
      method: 'PATCH',
      body: data,
      query,
    })
  },

  async delete(table: string, eq?: Record<string, any>): Promise<void> {
    const query: Record<string, string> = {}
    if (eq) {
      Object.entries(eq).forEach(([key, value]) => {
        query[key] = `eq.${value}`
      })
    }

    await this.request(table, {
      method: 'DELETE',
      query,
    })
  },

  // RPC function call helper
  async rpc<T = any>(functionName: string, params: Record<string, any>): Promise<T> {
    const url = new URL(`${REST_URL}/rpc/${functionName}`)
    
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'apikey': supabaseServiceRoleKey,
        'Authorization': `Bearer ${supabaseServiceRoleKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      const errorData = await response.text()
      throw new Error(`Supabase RPC error: ${response.status} - ${errorData}`)
    }

    // RPC functions might return different formats, try to parse as JSON
    const text = await response.text()
    if (!text) {
      return true as T // Some functions return void (boolean true indicates success)
    }
    
    try {
      return JSON.parse(text) as T
    } catch {
      return text as T
    }
  },
}

// REST client initialized

