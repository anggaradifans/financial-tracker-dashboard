import React, { useState } from 'react';
import { Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';

interface PasswordPromptModalProps {
  isOpen: boolean;
  fileName: string;
  errorMessage?: string | null;
  onSubmit: (password: string) => void;
  onCancel: () => void;
}

export const PasswordPromptModal: React.FC<PasswordPromptModalProps> = ({
  isOpen,
  fileName,
  errorMessage,
  onSubmit,
  onCancel,
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    onSubmit(password);
  };

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto animate-fadeIn">
      <div className="flex items-center justify-center min-h-screen px-4 text-center sm:p-0">
        <div
          className="fixed inset-0 bg-gray-900/60 dark:bg-gray-950/80 backdrop-blur-sm transition-opacity"
          onClick={onCancel}
        />

        <div className="inline-block bg-white dark:bg-gray-800 rounded-2xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:max-w-md w-full p-6 border border-gray-200 dark:border-gray-700 animate-scaleIn transition-colors duration-300">
          <div className="flex items-center mb-4">
            <div className="h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 dark:text-amber-400 mr-3">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Password Protected PDF
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[280px]">
                {fileName}
              </p>
            </div>
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
            This statement is encrypted. Enter your password to unlock and parse it in memory. It will never be stored or transmitted.
          </p>

          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Statement Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="e.g. Date of birth (DDMMYYYY)"
                  autoFocus
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 pr-10 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {errorMessage && (
                <div className="mt-2 flex items-center text-xs text-red-600 dark:text-red-400">
                  <AlertCircle className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!password.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-colors"
              >
                Unlock & Parse
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
