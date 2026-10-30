# Engineering standards

- Add row-level security policies and ownership tests for every new table, bucket, function, and endpoint.
- Use database migrations for schema changes, with rollback or data-migration plans where needed.
- Add focused integration tests for permission boundaries and idempotency, especially for imports, recurring jobs, transfers, and notifications.
- Keep external credentials in server-side secrets. Never expose service-role keys or messaging tokens in the Vite client bundle.
