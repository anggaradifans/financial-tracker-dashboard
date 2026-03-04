/**
 * OCR Service Interface
 *
 * Abstracts OCR implementation so we can swap between:
 * - Tesseract.js (browser-based, free)
 * - Google Gemini API (cloud-based, paid)
 * - OpenAI GPT-4o (cloud-based, paid)
 *
 * without changing business logic or UI code.
 */

export interface OcrResult {
  /** Raw text extracted from the image */
  text: string
  /** Confidence score from 0 to 100 */
  confidence: number
}

export type OcrProgressCallback = (progress: number) => void

export interface OcrService {
  /**
   * Extract text from an image file.
   * @param image - The image file or blob to process
   * @param onProgress - Optional callback for progress updates (0-100)
   * @returns Extracted text and confidence score
   */
  recognizeText(image: File | Blob, onProgress?: OcrProgressCallback): Promise<OcrResult>
}
