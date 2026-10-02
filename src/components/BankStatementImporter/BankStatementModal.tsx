import React, { useState } from 'react';
import { X, Sparkles, RefreshCw, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';
import { PdfDropzone } from './PdfDropzone';
import { PasswordPromptModal } from './PasswordPromptModal';
import { ImportSummaryBar } from './ImportSummaryBar';
import { StatementReviewTable } from './StatementReviewTable';
import { extractTextFromPdfBuffer, PasswordRequiredError, IncorrectPasswordError } from '../../utils/pdfExtractor';
import { parseStatementText, parseWithGemini } from '../../utils/parsers';
import { markDuplicates } from '../../utils/duplicateDetector';
import { ParsedCandidate } from '../../types/bankStatement';
import { Account, Category } from '../../types/financial';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { notifications } from '../../utils/notifications';

interface BankStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  accounts: Account[];
  onImportSuccess?: () => void;
}

type ModalStep = 'upload' | 'parsing' | 'review';

export const BankStatementModal: React.FC<BankStatementModalProps> = ({
  isOpen,
  onClose,
  categories,
  accounts,
  onImportSuccess,
}) => {
  const { user } = useAuth();

  const [step, setStep] = useState<ModalStep>('upload');
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [rawPdfText, setRawPdfText] = useState<string>('');
  const [candidates, setCandidates] = useState<ParsedCandidate[]>([]);
  const [detectedBank, setDetectedBank] = useState<string>('');
  const [needsAiFallback, setNeedsAiFallback] = useState<boolean>(false);
  const [globalAccountId, setGlobalAccountId] = useState<string>('');

  // Password modal state
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Loading & error states
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  if (!isOpen) return null;

  const resetState = () => {
    setStep('upload');
    setCurrentFile(null);
    setRawPdfText('');
    setCandidates([]);
    setDetectedBank('');
    setNeedsAiFallback(false);
    setGlobalAccountId('');
    setIsPasswordModalOpen(false);
    setPasswordError(null);
    setIsLoading(false);
    setIsSaving(false);
    setGeneralError(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const runDuplicateCheckAndFinishParsing = async (
    parsedRows: ParsedCandidate[],
    bankName: string
  ) => {
    try {
      // Find matching account from user's accounts list
      let matchedAccountId = '';
      const matchedAccount = accounts.find((a) =>
        a.name.toLowerCase().includes(bankName.toLowerCase())
      );
      if (matchedAccount) {
        matchedAccountId = matchedAccount.id;
        setGlobalAccountId(matchedAccountId);
      }

      // Populate default account ID on candidates if matched
      const rowsWithAccount = parsedRows.map((r) => ({
        ...r,
        targetAccountId: r.targetAccountId || matchedAccountId || null,
      }));

      if (rowsWithAccount.length === 0) {
        setCandidates([]);
        setStep('review');
        return;
      }

      // Find date boundaries
      const dates = rowsWithAccount
        .map((r) => new Date(r.occurred_at).getTime())
        .filter((t) => !isNaN(t));

      const minTime = Math.min(...dates) - 36 * 60 * 60 * 1000;
      const maxTime = Math.max(...dates) + 36 * 60 * 60 * 1000;

      // Query existing transactions for duplicate detection
      let query = supabase
        .from('transactions')
        .select('id, occurred_at, amount, type, description, account_id')
        .gte('occurred_at', new Date(minTime).toISOString())
        .lte('occurred_at', new Date(maxTime).toISOString())
        .is('deleted_at', null);

      if (user?.id) {
        query = query.eq('user_id', user.id);
      }

      const { data: existingRows, error: queryError } = await query;
      if (queryError) {
        console.warn('Could not query existing transactions for duplicate check:', queryError);
      }

      const deduplicated = markDuplicates(rowsWithAccount, existingRows || []);
      setCandidates(deduplicated);
      setStep('review');
    } catch (err: any) {
      setGeneralError(err?.message || 'Error processing statement.');
      setStep('review');
    } finally {
      setIsLoading(false);
    }
  };

  const processPdfBuffer = async (file: File, password?: string) => {
    setIsLoading(true);
    setGeneralError(null);
    setPasswordError(null);

    try {
      const buffer = await file.arrayBuffer();
      const text = await extractTextFromPdfBuffer(buffer, password);
      setRawPdfText(text);
      setIsPasswordModalOpen(false);

      const result = await parseStatementText(text);
      setDetectedBank(result.parserName);

      if (result.needsAiFallback || result.candidates.length === 0) {
        setNeedsAiFallback(true);
        setCandidates([]);
        setStep('review');
        setIsLoading(false);
      } else {
        setNeedsAiFallback(false);
        await runDuplicateCheckAndFinishParsing(result.candidates, result.parserName);
      }
    } catch (err: any) {
      setIsLoading(false);
      if (err instanceof PasswordRequiredError) {
        setIsPasswordModalOpen(true);
      } else if (err instanceof IncorrectPasswordError) {
        setIsPasswordModalOpen(true);
        setPasswordError('Incorrect password. Please try again.');
      } else {
        setGeneralError(err?.message || 'Failed to read PDF file.');
      }
    }
  };

  const handleFileLoaded = (file: File) => {
    setCurrentFile(file);
    processPdfBuffer(file);
  };

  const handlePasswordSubmit = (password: string) => {
    if (!currentFile) return;
    processPdfBuffer(currentFile, password);
  };

  const handleAiFallback = async () => {
    if (!rawPdfText) return;
    setIsLoading(true);
    setGeneralError(null);

    try {
      // Read the session per call so a refreshed token is used.
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session?.access_token) throw new Error('Please sign in to use AI parsing.');

      const aiCandidates = await parseWithGemini(rawPdfText, session.access_token);
      setDetectedBank('AI (Gemini Flash)');
      setNeedsAiFallback(false);
      await runDuplicateCheckAndFinishParsing(aiCandidates, 'AI');
    } catch (err: any) {
      setGeneralError(err?.message || 'AI parsing failed. Please try again later.');
      setIsLoading(false);
    }
  };

  const handleGlobalAccountChange = (newAccountId: string) => {
    setGlobalAccountId(newAccountId);
    setCandidates((prev) =>
      prev.map((c) => ({
        ...c,
        targetAccountId: newAccountId,
      }))
    );
  };

  const handleToggleCandidate = (tempId: string) => {
    setCandidates((prev) =>
      prev.map((c) => (c.tempId === tempId ? { ...c, selected: !c.selected } : c))
    );
  };

  const handleUpdateCandidate = (tempId: string, updates: Partial<ParsedCandidate>) => {
    setCandidates((prev) =>
      prev.map((c) => (c.tempId === tempId ? { ...c, ...updates } : c))
    );
  };

  const handleRemoveCandidate = (tempId: string) => {
    setCandidates((prev) => prev.filter((c) => c.tempId !== tempId));
  };

  const handleSelectAll = () => {
    setCandidates((prev) => prev.map((c) => ({ ...c, selected: true })));
  };

  const handleDeselectAll = () => {
    setCandidates((prev) => prev.map((c) => ({ ...c, selected: false })));
  };

  const handleSelectOnlyNew = () => {
    setCandidates((prev) => prev.map((c) => ({ ...c, selected: !c.isDuplicate })));
  };

  const handleSaveToTransactions = async () => {
    const selectedRows = candidates.filter((c) => c.selected);
    if (selectedRows.length === 0) {
      notifications.error('Please select at least one transaction to import.');
      return;
    }

    // Default category fallback: look for user's Uncategorized category or first category
    const defaultCat =
      categories.find((c) => c.name.toLowerCase() === 'uncategorized') || categories[0];

    if (!defaultCat && selectedRows.some((r) => !r.categoryId)) {
      notifications.error('Please assign categories before importing.');
      return;
    }

    setIsSaving(true);
    setGeneralError(null);

    try {
      const inserts = selectedRows.map((r) => ({
        user_id: user?.id || null,
        account_id: r.targetAccountId || globalAccountId || null,
        category_id: r.categoryId || defaultCat.id,
        type: r.type,
        amount: r.amount,
        currency: 'IDR',
        description: r.description,
        occurred_at: r.occurred_at,
        metadata: {
          source: 'bank_statement_pdf',
          parser: detectedBank,
          date_raw: r.date_raw,
          imported_at: new Date().toISOString(),
        },
      }));

      const { error: insertError } = await supabase.from('transactions').insert(inserts);

      if (insertError) {
        throw new Error(insertError.message || 'Database insert failed.');
      }

      notifications.success(`Successfully imported ${selectedRows.length} transactions!`);
      if (onImportSuccess) {
        onImportSuccess();
      }
      handleClose();
    } catch (err: any) {
      setGeneralError(err?.message || 'Failed to save transactions. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const selectedCount = candidates.filter((c) => c.selected).length;

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-y-auto animate-fadeIn">
        <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
          <div
            className="fixed inset-0 bg-gray-900/60 dark:bg-gray-950/80 backdrop-blur-sm transition-opacity"
            onClick={handleClose}
          />

          <div className="inline-block bg-white dark:bg-gray-800 rounded-2xl text-left overflow-hidden shadow-2xl transform transition-all w-full max-w-5xl my-8 p-6 border border-gray-200 dark:border-gray-700 animate-scaleIn transition-colors duration-300">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-700 mb-5">
              <div className="flex items-center space-x-3">
                {step === 'review' && (
                  <button
                    type="button"
                    onClick={() => setStep('upload')}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors mr-1"
                    title="Upload another statement"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                )}
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    Import Bank Statement PDF
                    {detectedBank && step === 'review' && (
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300">
                        {detectedBank}
                      </span>
                    )}
                  </h2>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    {step === 'upload'
                      ? 'Upload your PDF e-statement to extract transactions locally in your browser'
                      : 'Review extracted line items, adjust categories, and batch import'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleClose}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Error banner */}
            {generalError && (
              <div className="mb-4 flex items-center text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 p-3 rounded-xl border border-red-200 dark:border-red-900/50">
                <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0" />
                <span>{generalError}</span>
              </div>
            )}

            {/* Step: Upload */}
            {step === 'upload' && (
              <div className="py-6">
                <PdfDropzone onFileLoaded={handleFileLoaded} isLoading={isLoading} />
              </div>
            )}

            {/* Step: Review */}
            {step === 'review' && (
              <div>
                {/* Fallback Banner if bank format was unknown or 0 rows */}
                {needsAiFallback && (
                  <div className="mb-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start space-x-3">
                      <Sparkles className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                          Template not recognized
                        </h4>
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          This statement does not match standard Mandiri or Jenius templates. You can parse it automatically using Gemini Flash AI.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleAiFallback}
                      disabled={isLoading}
                      className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 shadow-sm transition-colors whitespace-nowrap"
                    >
                      {isLoading ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" />
                          Analyzing with AI...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                          Parse with Gemini AI
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Summary Bar */}
                {candidates.length > 0 && (
                  <ImportSummaryBar
                    candidates={candidates}
                    accounts={accounts}
                    selectedAccountId={globalAccountId}
                    onAccountChange={handleGlobalAccountChange}
                    onSelectAll={handleSelectAll}
                    onDeselectAll={handleDeselectAll}
                    onSelectOnlyNew={handleSelectOnlyNew}
                  />
                )}

                {/* Review Table */}
                <div className="max-h-[50vh] overflow-y-auto mb-5 pr-1">
                  <StatementReviewTable
                    candidates={candidates}
                    categories={categories}
                    onToggleCandidate={handleToggleCandidate}
                    onUpdateCandidate={handleUpdateCandidate}
                    onRemoveCandidate={handleRemoveCandidate}
                  />
                </div>

                {/* Action Footer */}
                <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={() => setStep('upload')}
                    className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    Upload Another Statement
                  </button>

                  <div className="flex items-center space-x-2 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveToTransactions}
                      disabled={isSaving || selectedCount === 0}
                      className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-2 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-colors"
                    >
                      {isSaving ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                          Importing...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Import {selectedCount} Transaction{selectedCount === 1 ? '' : 's'}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Password Prompt Modal */}
      <PasswordPromptModal
        isOpen={isPasswordModalOpen}
        fileName={currentFile?.name || ''}
        errorMessage={passwordError}
        onSubmit={handlePasswordSubmit}
        onCancel={() => {
          setIsPasswordModalOpen(false);
          setIsLoading(false);
        }}
      />
    </>
  );
};
