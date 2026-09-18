import * as Sentry from '@sentry/react'

export const initializeMonitoring = () => {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
  })
}

export const captureException = (error: unknown) => {
  if (import.meta.env.VITE_SENTRY_DSN) {
    Sentry.captureException(error)
  }
}
