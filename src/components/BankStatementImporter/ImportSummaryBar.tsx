import React from 'react';
import { CheckSquare, Square, Filter, CreditCard } from 'lucide-react';
import { ParsedCandidate } from '../../types/bankStatement';
import { Account } from '../../types/financial';

interface ImportSummaryBarProps {
  candidates: ParsedCandidate[];
  accounts: Account[];
  selectedAccountId: string;
  onAccountChange: (accountId: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onSelectOnlyNew: () => void;
}

export const ImportSummaryBar: React.FC<ImportSummaryBarProps> = ({
  candidates,
  accounts,
  selectedAccountId,
  onAccountChange,
  onSelectAll,
  onDeselectAll,
  onSelectOnlyNew,
}) => {
  const selectedCount = candidates.filter((c) => c.selected).length;
  const duplicateCount = candidates.filter((c) => c.isDuplicate).length;

  const totalOutcome = candidates
    .filter((c) => c.selected && c.type === 'outcome')
    .reduce((sum, c) => sum + c.amount, 0);

  const totalIncome = candidates
    .filter((c) => c.selected && c.type === 'income')
    .reduce((sum, c) => sum + c.amount, 0);

  return (
    <div className="bg-gray-50 dark:bg-gray-800/80 rounded-xl p-4 border border-gray-200 dark:border-gray-700/80 mb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
      {/* Stats summary */}
      <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm">
        <div className="flex items-center space-x-1.5">
          <span className="text-gray-500 dark:text-gray-400">Total Found:</span>
          <span className="font-semibold text-gray-900 dark:text-white">{candidates.length}</span>
        </div>

        <div className="flex items-center space-x-1.5">
          <span className="text-gray-500 dark:text-gray-400">Selected:</span>
          <span className="font-bold text-indigo-600 dark:text-indigo-400">{selectedCount}</span>
        </div>

        {duplicateCount > 0 && (
          <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs font-medium">
            <span>{duplicateCount} duplicates detected</span>
          </div>
        )}

        <div className="hidden lg:flex items-center space-x-3 border-l border-gray-300 dark:border-gray-600 pl-4">
          <span className="text-red-600 dark:text-red-400 font-medium">
            Out: -Rp {totalOutcome.toLocaleString('id-ID')}
          </span>
          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
            In: +Rp {totalIncome.toLocaleString('id-ID')}
          </span>
        </div>
      </div>

      {/* Target account selector & quick buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center space-x-1.5 mr-2">
          <CreditCard className="h-4 w-4 text-gray-400" />
          <select
            value={selectedAccountId}
            onChange={(e) => onAccountChange(e.target.value)}
            className="text-xs font-medium bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-2.5 py-1.5 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">-- Apply Account to All --</option>
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center space-x-1 border-l border-gray-300 dark:border-gray-600 pl-2">
          <button
            type="button"
            onClick={onSelectAll}
            title="Select all rows"
            className="inline-flex items-center px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
          >
            <CheckSquare className="h-3.5 w-3.5 mr-1" />
            All
          </button>
          <button
            type="button"
            onClick={onDeselectAll}
            title="Deselect all rows"
            className="inline-flex items-center px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
          >
            <Square className="h-3.5 w-3.5 mr-1" />
            None
          </button>
          {duplicateCount > 0 && (
            <button
              type="button"
              onClick={onSelectOnlyNew}
              title="Select only new non-duplicate rows"
              className="inline-flex items-center px-2 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded transition-colors"
            >
              <Filter className="h-3.5 w-3.5 mr-1" />
              Only New
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
