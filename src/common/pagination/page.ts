export interface Page<T> {
  items: T[];
  pagination: { total: number; offset: number; limit: number };
}
