# Service-role credential exposure

Status: contained September 16, 2026; follow-up in progress.

## What happened

The dashboard used a Supabase legacy `service_role` JWT in browser requests.
Vite embedded that referenced environment value in the published JavaScript.
Anyone who downloaded the bundle could use the credential to bypass Row Level
Security for API-accessible data and perform privileged reads or writes.

The council report gives March 4, 2026 as the first exposed deployment date.
That start date has not been independently reconstructed from retained hosting
or Supabase logs. The old credential was disabled on September 16 and was
verified to return HTTP 401 that day and again on September 17.

## Potential scope

The September 16 pre-rollout backup contained 918 transactions. Aggregate-only
production checks on September 17 found one Auth user, one transaction owner,
one budget owner, one active Telegram link, no unowned transactions, and no
unowned budgets. The single account owner has confirmed the Telegram and
Supabase identities belong to them. There are no other identified data subjects
to notify.

The credential could access the public application tables. Available evidence
does not prove that an outsider downloaded or used it. Supabase Free retains too
little log history to investigate the reported March-to-September interval.

## Containment

- Browser data access now uses a Supabase publishable key and each signed-in
  user's access token.
- Row Level Security and owner policies are live on application tables.
- The Telegram, receipt, and PDF backends use a replacement secret key.
- Legacy anon and service-role API keys are disabled.
- The old service-role credential returns HTTP 401.
- Current public bundles contain a publishable key and no detected legacy JWT,
  Supabase secret-key, or Google API-key pattern.
- Historical Vercel deployment URLs are protected by Vercel login. The June 16
  deployment remains in retention history but is not anonymously reachable.

## Recovery and evidence limits

Schema and data dumps were created off Supabase on September 16. The owner
states that the dump was restored successfully; this report records that restore
as completed by owner attestation because no retained restore transcript is
available.

The project is on Supabase Free. Managed scheduled backups are unavailable and
Point in Time Recovery is a paid add-on. The dashboard exposes at most 24 hours
of logs on this plan; 7, 14, and 28-day ranges are locked. Therefore the incident
period cannot be reconstructed from Supabase logs.

## Integrity follow-up

The current database has 928 transactions, including 9 soft-deleted rows, versus
918 rows in the September 16 containment backup. These aggregate counts do not
show malicious activity; they show that the ledger changed after the backup.
The owner still needs to compare the containment backup/current balances with
bank records or Telegram history and record any unexplained rows. No automated
check can infer which legitimate entries the owner made.

## Credential inventory conclusion

`VITE_GEMINI_API_KEY` exists in ignored local configuration and in Vercel, but
Git history shows it only as a placeholder and no source consumer was found.
Vite only publishes referenced environment values. Current public bundles have
no detected Google API-key pattern. There is no evidence this key was exposed by
this application; remove the unused Vercel/local variable as cleanup or rotate
it if it was shared through another system.
