export interface Book {
  id: string;
  title: string;
  authors: string[];
  publishedDate: string | null;
  description: string | null;
  coverUrl: string | null;
}
