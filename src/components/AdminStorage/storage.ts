export interface StorageSample { day: string; measured_at: string; database_bytes: number }
export interface StorageStatus {
  database_bytes: number; limit_bytes: number; measured_at: string
  samples: StorageSample[]
  tables: { name: string; rows: number; total_bytes: number; index_bytes: number }[]
}
export const megabytes = (bytes: number) => `${(bytes / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })} MB`
export function storageHealth(bytes: number) {
  return bytes >= 450_000_000 ? 'Urgent action' : bytes >= 400_000_000 ? 'Prepare archive' : bytes >= 350_000_000 ? 'Warning' : 'Within capacity'
}
export function storageForecast(samples: StorageSample[], used: number, limit: number) {
  const sorted = [...samples].sort((a, b) => a.day.localeCompare(b.day))
  const first = sorted[0], last = sorted[sorted.length - 1]
  const days = first && last ? (Date.parse(last.day) - Date.parse(first.day)) / 86_400_000 : 0
  if (days < 1) return null
  const daily = (last.database_bytes - first.database_bytes) / days
  return { daily, daysRemaining: daily > 0 ? Math.max(0, Math.ceil((limit - used) / daily)) : null }
}
