/**
 * Standardised API Response Envelope
 *
 * All API responses share the same shape so clients can handle them uniformly:
 *
 *  {
 *    success: true | false,
 *    message?: string,
 *    data?: T,
 *    error?: string,
 *    statusCode: number
 *  }
 */

export interface ApiResponseShape<T = unknown> {
  success: boolean;
  statusCode: number;
  message?: string;
  data?: T;
  error?: string;
}

export class ApiResponse {
  static success<T>(data: T, message?: string, statusCode = 200): ApiResponseShape<T> {
    return {
      success: true,
      statusCode,
      ...(message ? { message } : {}),
      data,
    };
  }

  static error(errorMessage: string, statusCode = 500): ApiResponseShape<never> {
    return {
      success: false,
      statusCode,
      error: errorMessage,
    };
  }
}
