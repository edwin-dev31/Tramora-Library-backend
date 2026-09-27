export interface GoogleBooksResponse {
  totalItems: number;
  items?: GoogleBook[];
}

export interface GoogleBook {
  id: string;
  volumeInfo?: {
    title?: string;
    authors?: string[];
    publishedDate?: string;
    description?: string;
    imageLinks?: {
      thumbnail?: string;
      smallThumbnail?: string;
    };
  };
}
