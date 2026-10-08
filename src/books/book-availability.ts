import type { AvailabilitySnapshot } from './books.repository.js';
import type { BookAvailability } from './models/book.model.js';

export const bookAvailability = (
  snapshot: AvailabilitySnapshot,
  userId: string,
): BookAvailability => {
  const borrowedByMe = snapshot.borrower_id === userId;
  const canBorrow =
    snapshot.borrower_id === null &&
    (snapshot.reservation_user_id === null ||
      snapshot.reservation_user_id === userId);

  return {
    status: snapshot.borrower_id
      ? 'loaned'
      : snapshot.reservation_user_id
        ? 'reserved'
        : 'available',
    canBorrow,
    canReserve: !canBorrow && !borrowedByMe && !snapshot.has_reservation,
    borrowedByMe,
    reservedByMe: snapshot.has_reservation,
  };
};
