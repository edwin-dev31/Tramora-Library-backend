export interface ApiError {
  code: string;
  details?: string[];
}

export type ApiResponse<T> =
  | {
      data: T;
      error: null;
      message: string;
    }
  | {
      data: null;
      error: ApiError;
      message: string;
    };
