export interface Book {
  id: string;
  title: string;
  authors: string[];
  publishedDate: string | null;
  description: string | null;
  coverUrl: string | null;
}

export interface BookAvailability {
  status: 'available' | 'loaned' | 'reserved';
  canBorrow: boolean;
  canReserve: boolean;
  borrowedByMe: boolean;
  reservedByMe: boolean;
}

export interface BookDetail extends Book {
  availability: BookAvailability;
}
