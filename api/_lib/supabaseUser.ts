/** Resolves to the user, or null when the token is missing, expired, or invalid. */
export type VerifyUser = (accessToken: string) => Promise<{ id: string } | null>;

/**
 * Resolves a Supabase access token to its user by asking Supabase Auth, so the
 * function never needs the JWT signing secret.
 */
export function createSupabaseUserVerifier(supabaseUrl: string, publishableKey: string, fetchImpl: typeof fetch): VerifyUser {
  return async (accessToken) => {
    const response = await fetchImpl(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` },
    });

    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok) {
      throw new Error(`Supabase Auth returned ${response.status}`);
    }

    const user = await response.json() as { id?: unknown };
    return typeof user.id === 'string' && user.id ? { id: user.id } : null;
  };
}
