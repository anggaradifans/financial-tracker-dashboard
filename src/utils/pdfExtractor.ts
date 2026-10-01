import * as pdfjsLib from 'pdfjs-dist';

// Set up worker source
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
  } catch {
    // Fallback if URL resolution fails
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  }
}

export class PasswordRequiredError extends Error {
  constructor(message = 'Password required to unlock PDF') {
    super(message);
    this.name = 'PasswordRequiredError';
  }
}

export class IncorrectPasswordError extends Error {
  constructor(message = 'Incorrect password for PDF') {
    super(message);
    this.name = 'IncorrectPasswordError';
  }
}

export async function extractTextFromPdfBuffer(
  buffer: ArrayBuffer,
  password?: string
): Promise<string> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    password: password || undefined,
  });

  loadingTask.onPassword = (_updatePassword: (pw: string) => void, reason: number) => {
    if (reason === pdfjsLib.PasswordResponses.INCORRECT_PASSWORD) {
      throw new IncorrectPasswordError();
    } else {
      throw new PasswordRequiredError();
    }
  };

  try {
    const pdf = await loadingTask.promise;
    let fullText = '';

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      const items = textContent.items as Array<{
        str: string;
        transform: number[];
      }>;

      // Group text by line with a vertical threshold
      const lineMap = new Map<number, Array<{ x: number; text: string }>>();
      for (const item of items) {
        if (!item.str) continue;
        const x = item.transform[4];
        const y = Math.round(item.transform[5]);

        let matchedY = y;
        for (const existingY of lineMap.keys()) {
          if (Math.abs(existingY - y) <= 3) {
            matchedY = existingY;
            break;
          }
        }

        if (!lineMap.has(matchedY)) {
          lineMap.set(matchedY, []);
        }
        lineMap.get(matchedY)!.push({ x, text: item.str });
      }

      // PDF coordinates 0,0 is bottom-left, so sort Y descending for top-to-bottom reading
      const sortedYs = Array.from(lineMap.keys()).sort((a, b) => b - a);
      const pageLines: string[] = [];

      for (const y of sortedYs) {
        const lineItems = lineMap.get(y)!;
        lineItems.sort((a, b) => a.x - b.x);
        pageLines.push(lineItems.map((i) => i.text).join(' '));
      }

      fullText += pageLines.join('\n') + '\n';
    }

    return fullText;
  } catch (error: any) {
    if (error instanceof IncorrectPasswordError || error instanceof PasswordRequiredError) {
      throw error;
    }
    if (error?.name === 'PasswordException') {
      if (error.code === 2) {
        throw new IncorrectPasswordError();
      }
      throw new PasswordRequiredError();
    }
    throw error;
  }
}
