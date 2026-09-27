CREATE TYPE book_provider AS ENUM ('google_books');

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255) NOT NULL,
  email         VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  CONSTRAINT users_email_unique UNIQUE (email)
);

CREATE TABLE books (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider    book_provider NOT NULL,
  provider_id VARCHAR(255) NOT NULL,
  title       VARCHAR(500) NOT NULL,
  author      VARCHAR(500) NOT NULL,
  description TEXT,
  genre       VARCHAR(100),
  cover_url   TEXT,
  available   BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT books_provider_provider_id_unique UNIQUE (provider, provider_id)
);

CREATE TABLE loans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  book_id       UUID NOT NULL REFERENCES books (id) ON DELETE CASCADE,
  loan_date     TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_date      TIMESTAMPTZ NOT NULL,
  return_date   TIMESTAMPTZ,
  renewal_count INTEGER NOT NULL DEFAULT 0,
  status        VARCHAR(20) NOT NULL DEFAULT 'active',
  CONSTRAINT loans_status_check CHECK (status IN ('active', 'returned', 'overdue'))
);

CREATE TABLE reservations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  book_id    UUID NOT NULL REFERENCES books (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status     VARCHAR(20) NOT NULL DEFAULT 'waiting',
  position   INTEGER NOT NULL,
  CONSTRAINT reservations_status_check
    CHECK (status IN ('waiting', 'ready', 'expired', 'collected')),
  CONSTRAINT reservations_position_check CHECK (position > 0)
);

CREATE TABLE user_book (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  book_id        UUID NOT NULL REFERENCES books (id) ON DELETE CASCADE,
  reading_status VARCHAR(20) NOT NULL DEFAULT 'want_to_read',
  wishlist       BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT user_book_reading_status_check
    CHECK (reading_status IN ('want_to_read', 'reading', 'completed')),
  CONSTRAINT user_book_user_book_unique UNIQUE (user_id, book_id)
);

CREATE UNIQUE INDEX loans_user_book_active_unique
  ON loans (user_id, book_id)
  WHERE status IN ('active', 'overdue');

CREATE INDEX loans_book_id_idx ON loans (book_id);
CREATE INDEX loans_due_date_idx ON loans (due_date);
CREATE INDEX reservations_user_id_idx ON reservations (user_id);
CREATE INDEX reservations_book_id_idx ON reservations (book_id);
CREATE INDEX user_book_user_id_idx ON user_book (user_id);
