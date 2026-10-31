import React, { useEffect, useId, useRef, useState } from 'react'
import { format } from 'date-fns'
import { Loader2, X } from 'lucide-react'
import { Account } from '../../types/financial'
import {
  canTransfer,
  transferErrorMessage,
  transferTargets,
  TransferFormErrors,
  TransferFormValues,
  validateTransfer,
} from '../../utils/transfers'

interface TransferFormProps {
  accounts: Account[]
  // transferId is the idempotency key for this dialog: retrying with it cannot create a second transfer.
  onSave: (values: TransferFormValues, transferId: string) => Promise<void>
  onCancel: () => void
}

const fieldClass = (invalid: boolean) =>
  `w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 transition-colors ${
    invalid ? 'border-red-500 dark:border-red-600' : 'border-gray-300 dark:border-gray-600'
  }`
const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 transition-colors'

const FieldError: React.FC<{ message?: string }> = ({ message }) =>
  message ? <p className="text-red-500 dark:text-red-400 text-xs mt-1 transition-colors">{message}</p> : null

const TransferForm: React.FC<TransferFormProps> = ({ accounts, onSave, onCancel }) => {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [transferId] = useState(() => crypto.randomUUID())
  const [values, setValues] = useState<TransferFormValues>({
    fromAccountId: '',
    toAccountId: '',
    amount: '',
    occurredOn: format(new Date(), 'yyyy-MM-dd'),
    description: '',
  })
  const [errors, setErrors] = useState<TransferFormErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    const trigger = document.activeElement as HTMLElement | null
    dialog?.showModal()
    return () => {
      dialog?.close()
      trigger?.focus()
    }
  }, [])

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== 'Tab') return
    const controls = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')
    const first = controls[0]
    const last = controls[controls.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  const change = (patch: Partial<TransferFormValues>) => {
    setValues(prev => ({ ...prev, ...patch }))
    setErrors(prev => {
      const next = { ...prev }
      for (const key of Object.keys(patch) as (keyof TransferFormValues)[]) delete next[key]
      return next
    })
    setFormError(null)
  }

  const changeFrom = (fromAccountId: string) => {
    // A destination that no longer fits the new source (another currency) is cleared.
    const stillValid = transferTargets(accounts, fromAccountId).some(account => account.id === values.toAccountId)
    change({ fromAccountId, toAccountId: stillValid ? values.toAccountId : '' })
  }

  const targets = transferTargets(accounts, values.fromAccountId)
  const from = accounts.find(account => account.id === values.fromAccountId)
  const available = canTransfer(accounts)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const found = validateTransfer(values, accounts)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setLoading(true)
    setFormError(null)
    try {
      await onSave(values, transferId)
      // The parent closes the dialog.
    } catch (error) {
      setFormError(transferErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  return (
    <dialog ref={dialogRef} aria-labelledby={titleId} onKeyDown={handleDialogKeyDown} onCancel={event => { event.preventDefault(); if (!loading) onCancel() }} className="fixed inset-0 m-0 w-full h-full max-w-none max-h-none bg-transparent backdrop:bg-black/50 dark:backdrop:bg-black/70 open:flex items-center justify-center p-0 sm:p-4">
      <div className="bg-white dark:bg-gray-800 rounded-none sm:rounded-lg shadow-xl max-w-2xl w-full h-full sm:h-auto sm:max-h-[90vh] overflow-y-auto pb-safe animate-scaleIn transition-colors duration-300">
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-3 sm:py-4 flex justify-between items-center transition-colors">
          <h2 id={titleId} className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white transition-colors">Add Transfer</h2>
          <button onClick={onCancel} disabled={loading} aria-label="Close form" className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4" noValidate>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Move money between two of your own accounts. A transfer is not income or spending, so it does not change your totals or budgets.
          </p>

          {!available && (
            <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
              You need two accounts in the same currency to record a transfer. Add one under Settings first.
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor={`${titleId}-from`} className={labelClass}>
                From account <span className="text-red-500 dark:text-red-400">*</span>
              </label>
              <select
                id={`${titleId}-from`}
                value={values.fromAccountId}
                onChange={event => changeFrom(event.target.value)}
                className={fieldClass(!!errors.fromAccountId)}
                disabled={!available}
              >
                <option value="">Choose account</option>
                {accounts.map(account => (
                  <option key={account.id} value={account.id}>{account.name} ({account.currency.trim()})</option>
                ))}
              </select>
              <FieldError message={errors.fromAccountId} />
            </div>

            <div>
              <label htmlFor={`${titleId}-to`} className={labelClass}>
                To account <span className="text-red-500 dark:text-red-400">*</span>
              </label>
              <select
                id={`${titleId}-to`}
                value={values.toAccountId}
                onChange={event => change({ toAccountId: event.target.value })}
                className={fieldClass(!!errors.toAccountId)}
                disabled={!available || !values.fromAccountId}
              >
                <option value="">{values.fromAccountId ? 'Choose account' : 'Choose the source first'}</option>
                {targets.map(account => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
              </select>
              <FieldError message={errors.toAccountId} />
            </div>

            <div>
              <label htmlFor={`${titleId}-amount`} className={labelClass}>
                Amount{from ? ` (${from.currency.trim()})` : ''} <span className="text-red-500 dark:text-red-400">*</span>
              </label>
              <input
                id={`${titleId}-amount`}
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={values.amount}
                onChange={event => change({ amount: event.target.value })}
                className={fieldClass(!!errors.amount)}
                disabled={!available}
              />
              <FieldError message={errors.amount} />
            </div>

            <div>
              <label htmlFor={`${titleId}-date`} className={labelClass}>
                Date <span className="text-red-500 dark:text-red-400">*</span>
              </label>
              <input
                id={`${titleId}-date`}
                type="date"
                value={values.occurredOn}
                onChange={event => change({ occurredOn: event.target.value })}
                className={fieldClass(!!errors.occurredOn)}
                disabled={!available}
              />
              <FieldError message={errors.occurredOn} />
            </div>
          </div>

          <div>
            <label htmlFor={`${titleId}-description`} className={labelClass}>Description (Optional)</label>
            <textarea
              id={`${titleId}-description`}
              value={values.description}
              onChange={event => change({ description: event.target.value })}
              rows={2}
              className={fieldClass(!!errors.description)}
              placeholder="For example: move savings to BCA"
              disabled={!available}
            />
            <FieldError message={errors.description} />
          </div>

          {formError && (
            <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-900/20 dark:text-red-200">{formError}</p>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700 transition-colors">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-primary-600 dark:bg-primary-500 text-white rounded-md hover:bg-primary-700 dark:hover:bg-primary-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              disabled={loading || !available}
            >
              {loading ? (<><Loader2 className="h-4 w-4 animate-spin" />Saving...</>) : 'Save Transfer'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}

export default TransferForm
