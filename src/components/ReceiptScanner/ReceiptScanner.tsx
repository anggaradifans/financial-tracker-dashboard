import React, { useState, useRef, useCallback } from 'react'
import { Camera, Upload, X, Loader2, Check, AlertCircle } from 'lucide-react'
import { TesseractOcrService } from '../../lib/ocr/tesseractOcr'
import { parseReceipt } from '../../lib/ocr/receiptParser'
import type { ParsedReceipt } from '../../lib/ocr/receiptParser'
import type { OcrService } from '../../lib/ocr/ocrService'

interface ReceiptScannerProps {
  onReceiptParsed: (data: ParsedReceipt) => void
  onCancel: () => void
  ocrService?: OcrService
}

type ScanState = 'idle' | 'processing' | 'preview' | 'error'

const ReceiptScanner: React.FC<ReceiptScannerProps> = ({
  onReceiptParsed,
  onCancel,
  ocrService,
}) => {
  const [state, setState] = useState<ScanState>('idle')
  const [progress, setProgress] = useState(0)
  const [parsedData, setParsedData] = useState<ParsedReceipt | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const ocr = useRef<OcrService>(ocrService ?? new TesseractOcrService())

  const processImage = useCallback(async (file: File) => {
    // Show image preview
    const reader = new FileReader()
    reader.onload = (e) => setImagePreview(e.target?.result as string)
    reader.readAsDataURL(file)

    setState('processing')
    setProgress(0)
    setErrorMessage(null)

    try {
      const result = await ocr.current.recognizeText(file, (p) => setProgress(p))

      if (!result.text.trim()) {
        setState('error')
        setErrorMessage('No text detected in the image. Try a clearer photo.')
        return
      }

      const parsed = parseReceipt(result.text)
      setParsedData(parsed)
      setState('preview')
    } catch (err) {
      setState('error')
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to process image'
      )
    }
  }, [])

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        processImage(file)
      }
      // Reset input so the same file can be selected again
      e.target.value = ''
    },
    [processImage]
  )

  const handleApply = useCallback(() => {
    if (parsedData) {
      onReceiptParsed(parsedData)
    }
  }, [parsedData, onReceiptParsed])

  const handleRetry = useCallback(() => {
    setState('idle')
    setProgress(0)
    setParsedData(null)
    setImagePreview(null)
    setErrorMessage(null)
  }, [])

  const formatAmount = (amount: number | null): string => {
    if (amount === null) return '-'
    return new Intl.NumberFormat('id-ID').format(amount)
  }

  return (
    <div className="border border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-primary-600 dark:text-primary-400" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Scan Receipt
          </span>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Idle State — Upload Buttons */}
      {state === 'idle' && (
        <div className="flex flex-col sm:flex-row gap-2">
          {/* Hidden inputs */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
            id="receipt-file-input"
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileSelect}
            className="hidden"
            id="receipt-camera-input"
          />

          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
          >
            <Camera className="h-4 w-4" />
            Take Photo
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
          >
            <Upload className="h-4 w-4" />
            Upload Image
          </button>
        </div>
      )}

      {/* Processing State */}
      {state === 'processing' && (
        <div className="space-y-3">
          {imagePreview && (
            <img
              src={imagePreview}
              alt="Receipt preview"
              className="w-full max-h-40 object-contain rounded-md bg-gray-100 dark:bg-gray-700"
            />
          )}
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary-600 dark:text-primary-400" />
            <div className="flex-1">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                Reading receipt... {progress}%
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 transition-colors">
                <div
                  className="bg-primary-600 dark:bg-primary-400 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error State */}
      {state === 'error' && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md">
            <AlertCircle className="h-4 w-4 text-red-500 dark:text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-300">{errorMessage}</p>
          </div>
          <button
            type="button"
            onClick={handleRetry}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Preview State — Show Parsed Results */}
      {state === 'preview' && parsedData && (
        <div className="space-y-3">
          {imagePreview && (
            <img
              src={imagePreview}
              alt="Receipt preview"
              className="w-full max-h-32 object-contain rounded-md bg-gray-100 dark:bg-gray-700"
            />
          )}

          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-md p-3 space-y-2 text-sm transition-colors">
            <h4 className="font-medium text-gray-900 dark:text-white">Detected Information</h4>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-gray-500 dark:text-gray-400">Amount:</span>
                <span className="ml-1 font-medium text-gray-900 dark:text-white">
                  {parsedData.currency && `${parsedData.currency} `}
                  {formatAmount(parsedData.amount)}
                </span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Date:</span>
                <span className="ml-1 font-medium text-gray-900 dark:text-white">
                  {parsedData.date ?? '-'}
                </span>
              </div>
              <div className="col-span-2">
                <span className="text-gray-500 dark:text-gray-400">Merchant:</span>
                <span className="ml-1 font-medium text-gray-900 dark:text-white">
                  {parsedData.merchantName ?? '-'}
                </span>
              </div>
            </div>

            {parsedData.items.length > 0 && (
              <div>
                <span className="text-gray-500 dark:text-gray-400">Items:</span>
                <ul className="mt-1 space-y-0.5">
                  {parsedData.items.slice(0, 5).map((item, i) => (
                    <li key={i} className="flex justify-between text-gray-700 dark:text-gray-300">
                      <span className="truncate mr-2">{item.name}</span>
                      <span className="flex-shrink-0">{formatAmount(item.price)}</span>
                    </li>
                  ))}
                  {parsedData.items.length > 5 && (
                    <li className="text-gray-400 dark:text-gray-500 text-xs">
                      +{parsedData.items.length - 5} more items
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleRetry}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
            >
              Rescan
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-primary-600 dark:bg-primary-500 text-white rounded-md text-sm hover:bg-primary-700 dark:hover:bg-primary-600 transition-colors font-medium"
            >
              <Check className="h-4 w-4" />
              Apply to Form
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ReceiptScanner
