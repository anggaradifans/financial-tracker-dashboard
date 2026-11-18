import './LoadingIndicator.css'

export interface LoadingIndicatorProps {
  variant?: 'spinner' | 'bar' | 'dots' | 'progress'
  size?: 'sm' | 'md' | 'lg'
  label?: string
  /** Only supply a percentage when the operation reports measurable progress. */
  value?: number
  hideLabel?: boolean
  className?: string
}

/** Use within an aria-busy region; keep existing data visible during refreshes. */
export function LoadingIndicator({
  variant = 'spinner', size = 'md', label = 'Loading financial data…',
  value, hideLabel = false, className = '',
}: LoadingIndicatorProps) {
  const progress = typeof value === 'number' && Number.isFinite(value)
    ? Math.min(100, Math.max(0, value)) : undefined
  const isProgress = variant === 'progress'
  const isBar = variant === 'bar' || isProgress

  return (
    <span
      className={`loading-indicator loading-indicator--${variant} loading-indicator--${size} ${className}`}
      role={isProgress ? 'progressbar' : 'status'}
      aria-label={isProgress ? label : undefined}
      aria-valuemin={isProgress ? 0 : undefined}
      aria-valuemax={isProgress ? 100 : undefined}
      aria-valuenow={isProgress ? progress : undefined}
    >
      {isBar ? (
        <>
          <span className={`loading-indicator__caption ${hideLabel ? 'sr-only' : ''}`}>
            <span>{label}</span>
            {isProgress && progress !== undefined && <span className="loading-indicator__value" aria-hidden="true">{Math.round(progress)}%</span>}
          </span>
          <span className="loading-indicator__track" aria-hidden="true">
            <span
              className={`loading-indicator__fill ${(!isProgress || progress === undefined) ? 'loading-indicator__fill--indeterminate' : ''}`}
              style={isProgress && progress !== undefined ? { width: `${progress}%` } : undefined}
            />
          </span>
        </>
      ) : (
        <>
          {variant === 'spinner' ? (
            <svg className="loading-indicator__spinner" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle className="loading-indicator__ring" cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" />
              <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          ) : (
            <span className="loading-indicator__dots" aria-hidden="true"><i /><i /><i /></span>
          )}
          <span className={hideLabel ? 'sr-only' : ''}>{label}</span>
        </>
      )}
    </span>
  )
}
