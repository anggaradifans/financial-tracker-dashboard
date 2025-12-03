/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY?: string // Optional, if using library version
  readonly VITE_SUPABASE_SERVICE_ROLE_KEY: string // Required for REST version
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
