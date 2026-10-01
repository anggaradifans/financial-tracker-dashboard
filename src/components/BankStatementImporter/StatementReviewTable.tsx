import React from 'react';
import { Trash2, AlertTriangle, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { ParsedCandidate } from '../../types/bankStatement';
import { Category } from '../../types/financial';

interface StatementReviewTableProps {
  candidates: ParsedCandidate[];
  categories: Category[];
  onToggleCandidate: (tempId: string) => void;
  onUpdateCandidate: (tempId: string, updates: Partial<ParsedCandidate>) => void;
  onRemoveCandidate: (tempId: string) => void;
}

export const StatementReviewTable: React.FC<StatementReviewTableProps> = ({
  candidates,
  categories,
  onToggleCandidate,
  onUpdateCandidate,
  onRemoveCandidate,
}) => {
  if (candidates.length === 0) {
    return (
      <div className="py-12 text-center text-gray-500 dark:text-gray-400">
        No candidate transactions to display.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-xl">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-left text-xs sm:text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800/90 text-gray-500 dark:text-gray-400 uppercase font-semibold text-[11px] tracking-wider">
          <tr>
            <th scope="col" className="px-3 py-3 w-10 text-center">
              #
            </th>
            <th scope="col" className="px-3 py-3 w-28">
              Date
            </th>
            <th scope="col" className="px-3 py-3">
              Description
            </th>
            <th scope="col" className="px-3 py-3 w-40">
              Category
            </th>
            <th scope="col" className="px-3 py-3 w-32 text-right">
              Amount
            </th>
            <th scope="col" className="px-3 py-3 w-24 text-center">
              Status
            </th>
            <th scope="col" className="px-2 py-3 w-10 text-center">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700/60">
          {candidates.map((c) => {
            const isSelected = c.selected;
            const dateObj = new Date(c.occurred_at);
            const dateStr = !isNaN(dateObj.getTime())
              ? dateObj.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
              : c.date_raw;

            return (
              <tr
                key={c.tempId}
                className={`transition-colors ${
                  isSelected
                    ? 'hover:bg-primary-50/30 dark:hover:bg-primary-950/20'
                    : 'opacity-60 bg-gray-50/50 dark:bg-gray-900/40 hover:opacity-90'
                }`}
              >
                {/* Selection Checkbox */}
                <td className="px-3 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={c.selected}
                    onChange={() => onToggleCandidate(c.tempId)}
                    className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 cursor-pointer"
                  />
                </td>

                {/* Date */}
                <td className="px-3 py-3 whitespace-nowrap text-gray-700 dark:text-gray-300 font-medium">
                  {dateStr}
                </td>

                {/* Description (Editable input) */}
                <td className="px-3 py-3">
                  <input
                    type="text"
                    value={c.description}
                    onChange={(e) => onUpdateCandidate(c.tempId, { description: e.target.value })}
                    className="w-full bg-transparent border-b border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-primary-500 dark:focus:border-primary-500 focus:bg-white dark:focus:bg-gray-700 focus:outline-none px-1 py-0.5 rounded text-gray-900 dark:text-gray-100 text-xs sm:text-sm transition-colors"
                  />
                </td>

                {/* Category Dropdown */}
                <td className="px-3 py-3">
                  <select
                    value={c.categoryId || ''}
                    onChange={(e) => {
                      const selectedCat = categories.find((cat) => cat.id === e.target.value);
                      onUpdateCandidate(c.tempId, {
                        categoryId: e.target.value || null,
                        suggestedCategoryName: selectedCat ? selectedCat.name : c.suggestedCategoryName,
                      });
                    }}
                    className="w-full text-xs bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                    <option value="">-- {c.suggestedCategoryName || 'Uncategorized'} --</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </td>

                {/* Amount with Type Pill */}
                <td className="px-3 py-3 whitespace-nowrap text-right">
                  <div className="flex items-center justify-end space-x-1.5">
                    {c.type === 'income' ? (
                      <span className="inline-flex items-center text-emerald-600 dark:text-emerald-400 font-semibold">
                        <ArrowDownLeft className="h-3.5 w-3.5 mr-0.5" />
                        +Rp {c.amount.toLocaleString('id-ID')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-red-600 dark:text-red-400 font-semibold">
                        <ArrowUpRight className="h-3.5 w-3.5 mr-0.5" />
                        -Rp {c.amount.toLocaleString('id-ID')}
                      </span>
                    )}
                  </div>
                </td>

                {/* Status / Duplicate Badge */}
                <td className="px-3 py-3 text-center whitespace-nowrap">
                  {c.isDuplicate ? (
                    <span
                      title={c.duplicateReason || 'Potential duplicate'}
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 cursor-help"
                    >
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Duplicate
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300">
                      New
                    </span>
                  )}
                </td>

                {/* Delete / Exclude */}
                <td className="px-2 py-3 text-center">
                  <button
                    type="button"
                    onClick={() => onRemoveCandidate(c.tempId)}
                    title="Remove row"
                    className="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
