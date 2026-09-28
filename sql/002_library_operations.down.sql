DROP INDEX reservations_expires_at_idx;
DROP INDEX reservations_book_ready_unique;
DROP INDEX reservations_user_book_active_unique;
ALTER TABLE reservations DROP COLUMN expires_at;
ALTER TABLE reservations DROP COLUMN ready_at;
ALTER TABLE reservations DROP COLUMN notifications_enabled;
ALTER TABLE reservations DROP CONSTRAINT reservations_status_check;
-- Reverting is intentionally rejected if cancelled reservations exist.
ALTER TABLE reservations ADD CONSTRAINT reservations_status_check
  CHECK (status IN ('waiting', 'ready', 'expired', 'collected'));
DROP INDEX loans_book_active_unique;
ALTER TABLE loans DROP CONSTRAINT loans_fine_amount_check;
ALTER TABLE loans DROP COLUMN fine_amount;
