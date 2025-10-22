import axios from 'axios';

/**
 * Centralized error handling for API calls
 * Extracts user-friendly error messages from various error formats
 */
export function handleApiError(error: unknown): string {
  // Axios error with response
  if (axios.isAxiosError(error) && error.response) {
    const data = error.response.data;
    
    // Check various error message formats
    if (typeof data === 'string') {
      return data;
    }
    
    if (data?.message) {
      return data.message;
    }
    
    if (data?.error) {
      return typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
    }
    
    // HTTP status message
    return `Request failed with status ${error.response.status}: ${error.response.statusText}`;
  }
  
  // Axios error without response (network error)
  if (axios.isAxiosError(error)) {
    if (error.code === 'ECONNABORTED') {
      return 'Request timeout - please try again';
    }
    if (error.code === 'ERR_NETWORK') {
      return 'Network error - please check your connection';
    }
    return error.message || 'Network error occurred';
  }
  
  // Standard Error object
  if (error instanceof Error) {
    return error.message;
  }
  
  // Unknown error type
  return 'An unexpected error occurred';
}

/**
 * Wrapper for API calls with consistent error handling and logging
 */
export async function apiCall<T>(
  operation: () => Promise<T>,
  operationName: string = 'API call'
): Promise<T> {
  try {
    const result = await operation();
    console.log(`[${operationName}] Success`);
    return result;
  } catch (error) {
    const errorMessage = handleApiError(error);
    console.error(`[${operationName}] Failed:`, errorMessage);
    throw new Error(errorMessage);
  }
}
