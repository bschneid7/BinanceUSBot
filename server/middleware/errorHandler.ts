import { Request, Response, NextFunction } from 'express';

/**
 * Standardized Error Handling Middleware
 * 
 * Provides consistent error responses across all API routes
 */

// Error types
export enum ErrorType {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  NOT_FOUND_ERROR = 'NOT_FOUND_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_API_ERROR = 'EXTERNAL_API_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  BUSINESS_LOGIC_ERROR = 'BUSINESS_LOGIC_ERROR'
}

// Custom error class
export class AppError extends Error {
  public readonly type: ErrorType;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: any;

  constructor(
    message: string,
    type: ErrorType = ErrorType.INTERNAL_ERROR,
    statusCode: number = 500,
    isOperational: boolean = true,
    details?: any
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);

    this.type = type;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;

    Error.captureStackTrace(this);
  }
}

// Predefined error factories
export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, ErrorType.VALIDATION_ERROR, 400, true, details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, ErrorType.AUTHENTICATION_ERROR, 401, true);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, ErrorType.AUTHORIZATION_ERROR, 403, true);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, ErrorType.NOT_FOUND_ERROR, 404, true);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests') {
    super(message, ErrorType.RATE_LIMIT_ERROR, 429, true);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, details?: any) {
    super(message, ErrorType.DATABASE_ERROR, 500, true, details);
  }
}

export class ExternalAPIError extends AppError {
  constructor(service: string, message: string, details?: any) {
    super(`${service} API error: ${message}`, ErrorType.EXTERNAL_API_ERROR, 502, true, details);
  }
}

export class BusinessLogicError extends AppError {
  constructor(message: string, details?: any) {
    super(message, ErrorType.BUSINESS_LOGIC_ERROR, 400, true, details);
  }
}

// Binance-specific error mapping
export function mapBinanceError(binanceError: any): AppError {
  const code = binanceError.code;
  const message = binanceError.msg || binanceError.message || 'Unknown Binance error';

  // Rate limiting
  if (code === -1003 || code === 429) {
    return new RateLimitError('Binance rate limit exceeded. Please try again later.');
  }

  // Authentication
  if (code === -2015 || code === -2014) {
    return new AuthenticationError('Invalid Binance API credentials');
  }

  // Insufficient balance
  if (code === -2010) {
    return new BusinessLogicError('Insufficient balance for trade', { binanceCode: code });
  }

  // Invalid symbol
  if (code === -1121) {
    return new ValidationError('Invalid trading symbol', { binanceCode: code });
  }

  // Order errors
  if (code === -2011) {
    return new BusinessLogicError('Order would immediately trigger', { binanceCode: code });
  }

  if (code === -1013) {
    return new ValidationError('Order size too small or too large', { binanceCode: code });
  }

  // Generic Binance error
  return new ExternalAPIError('Binance', message, { binanceCode: code });
}

// Error response formatter
interface ErrorResponse {
  success: false;
  error: {
    type: string;
    message: string;
    details?: any;
    timestamp: string;
    path?: string;
  };
}

function formatErrorResponse(
  error: AppError,
  req: Request
): ErrorResponse {
  return {
    success: false,
    error: {
      type: error.type,
      message: error.message,
      details: error.details,
      timestamp: new Date().toISOString(),
      path: req.path
    }
  };
}

// Global error handler middleware
export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Convert to AppError if not already
  let appError: AppError;

  if (err instanceof AppError) {
    appError = err;
  } else {
    // Log unexpected errors
    console.error('[ErrorHandler] Unexpected error:', err);
    
    appError = new AppError(
      process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : err.message,
      ErrorType.INTERNAL_ERROR,
      500,
      false
    );
  }

  // Log operational errors at appropriate level
  if (appError.isOperational) {
    if (appError.statusCode >= 500) {
      console.error(`[ErrorHandler] ${appError.type}:`, appError.message, appError.details);
    } else {
      console.warn(`[ErrorHandler] ${appError.type}:`, appError.message);
    }
  } else {
    // Log non-operational errors with full stack trace
    console.error('[ErrorHandler] Non-operational error:', {
      type: appError.type,
      message: appError.message,
      stack: appError.stack,
      details: appError.details
    });
  }

  // Send error response
  const response = formatErrorResponse(appError, req);
  res.status(appError.statusCode).json(response);
}

// Async handler wrapper to catch promise rejections
export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// 404 handler
export function notFoundHandler(req: Request, res: Response, next: NextFunction): void {
  const error = new NotFoundError(`Route ${req.method} ${req.path}`);
  next(error);
}

// Unhandled rejection handler
export function handleUnhandledRejection(): void {
  process.on('unhandledRejection', (reason: any) => {
    console.error('[ErrorHandler] Unhandled Promise Rejection:', reason);
    // In production, you might want to restart the process
    if (process.env.NODE_ENV === 'production') {
      console.error('[ErrorHandler] Shutting down due to unhandled rejection...');
      process.exit(1);
    }
  });
}

// Uncaught exception handler
export function handleUncaughtException(): void {
  process.on('uncaughtException', (error: Error) => {
    console.error('[ErrorHandler] Uncaught Exception:', error);
    // Always exit on uncaught exceptions
    console.error('[ErrorHandler] Shutting down due to uncaught exception...');
    process.exit(1);
  });
}

