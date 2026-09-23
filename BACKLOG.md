# Product Backlog

This backlog is ordered by the value it adds to someone tracking personal finances. Items move into implementation only after their user flow, data model, and success criteria are defined.

## Next

### Scheduled and recurring transactions

Let people create recurring income, bills, subscriptions, and savings transfers. The dashboard should show upcoming items separately from completed transactions, with a clear action to confirm, skip, or edit each occurrence.

**Technical approach:** Add `recurring_transactions` and generated-occurrence metadata to the Supabase schema. Use a scheduled Supabase Edge Function to create due occurrences idempotently, keyed by the schedule and due date. Add an Upcoming view to the Overview route, and provide confirm, skip, and edit actions that update only the relevant occurrence or the future schedule.

### Transfers and per-account balances

Treat a transfer as one linked action that decreases one account and increases another. Show a trustworthy balance for each account and prevent transfers from being counted as income or spending.

**Technical approach:** Add a `transfer_id` and a `transfer` transaction type. Create the debit and credit rows in one database transaction, enforce that their amounts and currencies match, and exclude transfers from income, outcome, budgets, and analytics queries. Calculate account balances from non-deleted transaction history rather than storing a mutable balance on the account row.

### CSV import with a review step

Allow an exported bank statement to be mapped to the app's fields, previewed, and checked for duplicates before anything is saved. Keep the existing CSV export as the matching data-portability path.

**Technical approach:** Parse CSV files in the browser with a maintained parser, then show column mapping, validation errors, and a preview before upload. Generate a transaction fingerprint from account, date, amount, type, and normalized description; use a unique database constraint plus an import batch record to prevent duplicates. Insert only validated rows through a server-side function or an authenticated bulk endpoint.

### Budget alerts

Let a person choose a warning threshold for each budget. Start with in-app alerts, then consider optional email or Telegram notifications only if the user enables them.

**Technical approach:** Add `warning_percentage`, notification preferences, and a notification-delivery log. Recalculate progress after each transaction change and create one in-app alert per budget period and threshold. A scheduled Edge Function can deliver opted-in email or Telegram alerts, using the delivery log to prevent repeated messages.

## Later

### Financial goals and sinking funds

Support goals such as an emergency fund, a holiday, or annual insurance. Each goal needs a target, date, contribution history, and a clear distinction from monthly spending budgets.

**Technical approach:** Create `goals` and `goal_contributions` tables. Link a contribution to a transaction only when the user explicitly chooses it, so normal expenses do not affect goal progress. Add a goal detail route with progress, target date, and contribution timeline.

### Multi-currency support

The data model already stores a transaction currency, but summaries assume IDR. Add a base currency, explicit conversion rates and dates, and a clear treatment for accounts held in other currencies.

**Technical approach:** Store a base currency in the user profile and an immutable exchange rate with every converted transaction. Fetch rates only from a trusted server-side integration, cache them by currency pair and date, and show both original and converted amounts. Never silently rewrite historical amounts when exchange rates change.

### Receipt attachments

Attach a receipt image or PDF to a transaction. Use private storage, show upload progress, and allow a receipt to be removed independently of the transaction.

**Technical approach:** Create a private Supabase Storage bucket and a `transaction_attachments` table protected by owner-based RLS policies. Upload directly with a short-lived signed URL, store metadata and checksums, validate MIME type and file size server-side, and display receipts through temporary signed read URLs.

### Faster transaction capture

Add a compact capture flow for common expense patterns, using the existing category and account choices. Consider Telegram capture only after its confirmation, error handling, and data-privacy flow are designed.

**Technical approach:** Add a mobile-first quick-capture sheet that pre-fills the most recently used account, category, and date, but always lets the user review before saving. Store user defaults in profile preferences. For Telegram, receive messages through a webhook, parse them into a draft transaction, and require a confirmation link or in-app review before writing data.

### Household sharing

Allow an owner to invite another person to a shared household, choose what they can view or edit, and keep personal accounts private. This needs a separate permissions and audit design before implementation.

**Technical approach:** Introduce `households`, `household_members`, and ownership scopes on accounts, categories, budgets, and transactions. Implement RLS policies around membership role and resource ownership, record membership and permission changes in an audit log, and use invitation tokens that expire.

## Product quality

### Onboarding for first-time users

Guide a new user through adding an account, categories, and their first transaction. The first empty Overview page should make the next step obvious without requiring a tour.

**Technical approach:** Derive onboarding state from real data instead of a brittle boolean: no account, no category, or no transaction. Render a small checklist on Overview with links to the relevant settings and transaction routes. Mark the experience complete when the required records exist.

### Search and filtering that persists

Persist selected transaction filters and date ranges in the URL so a person can bookmark a useful view and return to it after navigating between dashboard sections.

**Technical approach:** Use `useSearchParams` to serialize the period, custom date range, search term, filters, sort, and page. Validate every parameter against an allowlist before using it in a query, and update the URL with browser history replacement while a user types.

### Data backup and account deletion

Offer a complete export, a clear retention explanation, and a deliberate account-deletion flow. Confirm the exact data that will be removed before performing the deletion.

**Technical approach:** Generate an authenticated export bundle that includes transactions, accounts, categories, budgets, and attachments metadata. For deletion, require recent authentication and a typed confirmation, then run a server-side purge that removes database rows and private storage objects in a defined order. Keep an audit event without retaining deleted financial data.

## Delivery standards

- Add row-level security policies and ownership tests for every new table, bucket, function, and endpoint.
- Use database migrations for schema changes, with rollback or data-migration plans where needed.
- Add focused integration tests for permission boundaries and idempotency, especially for imports, recurring jobs, transfers, and notifications.
- Keep external credentials in server-side secrets. Never expose service-role keys or messaging tokens in the Vite client bundle.
