import Tesseract from 'tesseract.js'
import type { OcrService, OcrResult, OcrProgressCallback } from './ocrService'

/**
 * Tesseract.js implementation of OcrService.
 * Runs OCR entirely in the browser — no API key needed.
 *
 * Supports English and Indonesian languages for receipt scanning.
 */
export class TesseractOcrService implements OcrService {
  private readonly languages: string

  constructor(languages: string = 'eng+ind') {
    this.languages = languages
  }

  async recognizeText(
    image: File | Blob,
    onProgress?: OcrProgressCallback
  ): Promise<OcrResult> {
    const result = await Tesseract.recognize(image, this.languages, {
      logger: (info) => {
        if (info.status === 'recognizing text' && onProgress) {
          onProgress(Math.round(info.progress * 100))
        }
      },
    })

    return {
      text: result.data.text,
      confidence: result.data.confidence,
    }
  }
}
