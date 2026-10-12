export type BookProviderName = 'google_books' | 'open_library';

export const OPEN_LIBRARY_PREFIX = 'openlibrary:';

// Keep existing Google IDs intact; the namespace prevents cross-provider collisions.
export function parseBookProviderId(id: string): {
  provider: BookProviderName;
  remoteId: string;
} {
  return id.startsWith(OPEN_LIBRARY_PREFIX)
    ? {
        provider: 'open_library',
        remoteId: id.slice(OPEN_LIBRARY_PREFIX.length),
      }
    : { provider: 'google_books', remoteId: id };
}

// Internal SQL expression for queries that join books using the alias b.
export const BOOK_PUBLIC_ID_SQL =
  "CASE WHEN b.provider = 'open_library' THEN 'openlibrary:' || b.provider_id ELSE b.provider_id END";
