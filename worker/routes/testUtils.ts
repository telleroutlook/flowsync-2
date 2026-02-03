export type ApiErrorDetail = {
  path: string;
  message: string;
};

export type ApiError = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[];
  };
};

export type ApiSuccess<T> = {
  success: true;
  data: T;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export const readJson = async <T>(res: Response): Promise<ApiResponse<T>> => {
  return (await res.json()) as ApiResponse<T>;
};

export const expectError = <T>(response: ApiResponse<T>): ApiError => {
  if (response.success) {
    throw new Error('Expected error response');
  }
  return response;
};

export const expectSuccess = <T>(response: ApiResponse<T>): ApiSuccess<T> => {
  if (!response.success) {
    throw new Error(`Expected success response, got ${response.error.code}`);
  }
  return response;
};
