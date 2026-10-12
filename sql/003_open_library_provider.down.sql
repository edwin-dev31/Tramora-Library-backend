-- Refuse rollback while Open Library books exist; never discard their user data.
LOCK TABLE books IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM books WHERE provider::text = 'open_library') THEN
    RAISE EXCEPTION 'Cannot revert Open Library support while Open Library books exist';
  END IF;
END $$;

ALTER TYPE book_provider RENAME TO book_provider_with_open_library;
CREATE TYPE book_provider AS ENUM ('google_books');
ALTER TABLE books ALTER COLUMN provider TYPE book_provider
  USING provider::text::book_provider;
DROP TYPE book_provider_with_open_library;
