import { BankParser, BankParserOptions, ParserResult } from '../../types/bankStatement';
import { mandiriParser } from './mandiriParser';
import { jeniusParser } from './jeniusParser';
import { parseWithGemini } from './geminiAiParser';
import { inferCategory } from './categoryClassifier';

export const REGISTERED_PARSERS: BankParser[] = [
  mandiriParser,
  jeniusParser,
];

export async function parseStatementText(
  rawText: string,
  options?: BankParserOptions
): Promise<ParserResult> {
  for (const parser of REGISTERED_PARSERS) {
    if (parser.canHandle(rawText)) {
      const candidates = parser.parse(rawText, options);
      return {
        parserName: parser.name,
        candidates,
        needsAiFallback: false,
      };
    }
  }

  return {
    parserName: 'Unknown',
    candidates: [],
    needsAiFallback: true,
  };
}

export {
  mandiriParser,
  jeniusParser,
  parseWithGemini,
  inferCategory,
};
