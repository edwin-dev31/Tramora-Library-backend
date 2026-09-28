-- The current catalog models one lendable copy per book.
ALTER TABLE loans ADD COLUMN fine_amount NUMERIC(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE loans ADD CONSTRAINT loans_fine_amount_check CHECK (fine_amount >= 0);
CREATE UNIQUE INDEX loans_book_active_unique ON loans (book_id)
  WHERE status IN ('active', 'overdue');

ALTER TABLE reservations DROP CONSTRAINT reservations_status_check;
ALTER TABLE reservations ADD CONSTRAINT reservations_status_check
  CHECK (status IN ('waiting', 'ready', 'expired', 'collected', 'cancelled'));
ALTER TABLE reservations ADD COLUMN notifications_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE reservations ADD COLUMN ready_at TIMESTAMPTZ;
ALTER TABLE reservations ADD COLUMN expires_at TIMESTAMPTZ;
CREATE UNIQUE INDEX reservations_user_book_active_unique ON reservations (user_id, book_id)
  WHERE status IN ('waiting', 'ready');
CREATE UNIQUE INDEX reservations_book_ready_unique ON reservations (book_id)
  WHERE status = 'ready';
CREATE INDEX reservations_expires_at_idx ON reservations (expires_at) WHERE status = 'ready';
