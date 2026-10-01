export interface AvailableCategory {
  id: string;
  name: string;
}

export interface InferredCategoryResult {
  categoryName: string;
  categoryId: string | null;
}

const CATEGORY_RULES: [string, RegExp][] = [
  ['Bills', /\b(cloudflare|google|instagram|meta|pln|pdam|indihome|telkom|netflix|spotify|subscription|tagihan|bill)\b/i],
  ['Food', /\b(nasi|uduk|jco|marugame|udon|sukiya|solaria|coffee|kopi|cafe|restaurant|resto|food|makan|ayam|bakmi|sate|burger|pizza)\b/i],
  ['Transport', /\b(gojek|grab|taxi|bluebird|mrt|krl|kereta|tol|parking|parkir|shell|pertamina|bp)\b/i],
  ['Transfer', /\b(transfer|bi fast|ke bank|top up|topup|gopay|ovo|dana|shopeepay|feesible)\b/i],
  ['Fees', /\b(biaya administrasi|admin fee|service fee)\b/i],
  ['Shopping', /\b(tokopedia|shopee|lazada|blibli|bukalapak|tiktok shop|zalora|uniqlo|ikea)\b/i],
  ['Health', /\b(apotek|pharmacy|doctor|dokter|clinic|klinik|hospital|rumah sakit|halodoc)\b/i],
  ['Entertainment', /\b(cinema|bioskop|xxi|cgv|game|steam|playstation|nintendo)\b/i],
  ['Travel', /\b(travel|hotel|flight|tiket|booking|airbnb|agoda|traveloka)\b/i],
];

export function inferCategory(
  description: string,
  availableCategories: AvailableCategory[] = []
): InferredCategoryResult {
  const text = (description || '').trim();
  let matchedName = 'Uncategorized';

  for (const [categoryName, regex] of CATEGORY_RULES) {
    if (regex.test(text)) {
      matchedName = categoryName;
      break;
    }
  }

  // Look up matched category in user's available categories (case-insensitive)
  const found = availableCategories.find(
    (c) => c.name.toLowerCase() === matchedName.toLowerCase()
  );

  if (found) {
    return {
      categoryName: found.name,
      categoryId: found.id,
    };
  }

  // If not found, look for user's existing "Uncategorized" category ID if available
  const uncategorized = availableCategories.find(
    (c) => c.name.toLowerCase() === 'uncategorized'
  );

  return {
    categoryName: matchedName,
    categoryId: uncategorized ? uncategorized.id : null,
  };
}
