export interface ExistingTransactionMatch {
  id: string;
  occurred_at: string;
  amount: number;
  type: string;
  description?: string | null;
}

export function markDuplicates<T extends {
  occurred_at: string;
  amount: number;
  type: string;
  selected: boolean;
  isDuplicate: boolean;
  duplicateReason?: string;
}>(
  candidates: T[],
  existing: ExistingTransactionMatch[]
): T[] {
  // Allow 28-hour buffer to handle bank posting vs settlement & UTC/WIB conversion
  const TIME_BUFFER_MS = 28 * 60 * 60 * 1000;

  return candidates.map((candidate) => {
    const candidateTime = new Date(candidate.occurred_at).getTime();

    const matched = existing.find((ex) => {
      if (ex.type !== candidate.type) return false;
      if (Math.abs(ex.amount - candidate.amount) > 0.01) return false;

      const exTime = new Date(ex.occurred_at).getTime();
      return Math.abs(exTime - candidateTime) <= TIME_BUFFER_MS;
    });

    if (matched) {
      const formattedAmount = candidate.amount.toLocaleString('id-ID');
      const formattedDate = new Date(matched.occurred_at).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      return {
        ...candidate,
        isDuplicate: true,
        selected: false,
        duplicateReason: `Matches existing: ${formattedDate} - Rp ${formattedAmount} (${matched.description || 'No description'})`,
      };
    }

    return {
      ...candidate,
      isDuplicate: false,
      selected: candidate.selected ?? true,
    };
  });
}
