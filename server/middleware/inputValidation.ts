/**
 * Input Validation Middleware
 * 
 * Provides comprehensive input validation and sanitization for API endpoints
 * to prevent injection attacks, XSS, and other security vulnerabilities.
 * 
 * Features:
 * - Schema-based validation
 * - Type checking
 * - SQL injection prevention
 * - XSS prevention
 * - Path traversal prevention
 */

import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

export interface ValidationSchema {
  [key: string]: {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    required?: boolean;
    min?: number; // For numbers and string length
    max?: number; // For numbers and string length
    pattern?: RegExp; // For string pattern matching
    enum?: any[]; // Allowed values
    custom?: (value: any) => boolean; // Custom validation function
  };
}

export class InputValidator {
  /**
   * Validate request body against schema
   */
  public validateBody(schema: ValidationSchema) {
    return (req: Request, res: Response, next: NextFunction) => {
      const errors = this.validate(req.body, schema);
      
      if (errors.length > 0) {
        logger.warn('[InputValidator] Validation failed', {
          path: req.path,
          errors,
          body: this.sanitizeForLog(req.body),
        });

        return res.status(400).json({
          error: 'Validation Error',
          message: 'Invalid input data',
          details: errors,
        });
      }

      next();
    };
  }

  /**
   * Validate request query parameters against schema
   */
  public validateQuery(schema: ValidationSchema) {
    return (req: Request, res: Response, next: NextFunction) => {
      const errors = this.validate(req.query, schema);
      
      if (errors.length > 0) {
        logger.warn('[InputValidator] Query validation failed', {
          path: req.path,
          errors,
          query: req.query,
        });

        return res.status(400).json({
          error: 'Validation Error',
          message: 'Invalid query parameters',
          details: errors,
        });
      }

      next();
    };
  }

  /**
   * Validate data against schema
   */
  private validate(data: any, schema: ValidationSchema): string[] {
    const errors: string[] = [];

    // Check required fields
    for (const [key, rules] of Object.entries(schema)) {
      if (rules.required && (data[key] === undefined || data[key] === null)) {
        errors.push(`${key} is required`);
        continue;
      }

      // Skip validation if field is not provided and not required
      if (data[key] === undefined || data[key] === null) {
        continue;
      }

      const value = data[key];

      // Type validation
      if (!this.validateType(value, rules.type)) {
        errors.push(`${key} must be of type ${rules.type}`);
        continue;
      }

      // Min/Max validation for numbers
      if (rules.type === 'number') {
        if (rules.min !== undefined && value < rules.min) {
          errors.push(`${key} must be at least ${rules.min}`);
        }
        if (rules.max !== undefined && value > rules.max) {
          errors.push(`${key} must be at most ${rules.max}`);
        }
      }

      // Min/Max validation for strings (length)
      if (rules.type === 'string') {
        if (rules.min !== undefined && value.length < rules.min) {
          errors.push(`${key} must be at least ${rules.min} characters`);
        }
        if (rules.max !== undefined && value.length > rules.max) {
          errors.push(`${key} must be at most ${rules.max} characters`);
        }
      }

      // Pattern validation for strings
      if (rules.type === 'string' && rules.pattern) {
        if (!rules.pattern.test(value)) {
          errors.push(`${key} has invalid format`);
        }
      }

      // Enum validation
      if (rules.enum && !rules.enum.includes(value)) {
        errors.push(`${key} must be one of: ${rules.enum.join(', ')}`);
      }

      // Custom validation
      if (rules.custom && !rules.custom(value)) {
        errors.push(`${key} failed custom validation`);
      }

      // SQL injection check for strings
      if (rules.type === 'string' && this.containsSQLInjection(value)) {
        errors.push(`${key} contains potentially malicious content`);
      }

      // XSS check for strings
      if (rules.type === 'string' && this.containsXSS(value)) {
        errors.push(`${key} contains potentially malicious content`);
      }

      // Path traversal check for strings
      if (rules.type === 'string' && this.containsPathTraversal(value)) {
        errors.push(`${key} contains potentially malicious content`);
      }
    }

    return errors;
  }

  /**
   * Validate type
   */
  private validateType(value: any, type: string): boolean {
    switch (type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && !Array.isArray(value);
      default:
        return false;
    }
  }

  /**
   * Check for SQL injection patterns
   */
  private containsSQLInjection(value: string): boolean {
    const sqlPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/i,
      /(UNION\s+SELECT)/i,
      /(OR\s+1\s*=\s*1)/i,
      /(--|\#|\/\*|\*\/)/,
    ];

    return sqlPatterns.some(pattern => pattern.test(value));
  }

  /**
   * Check for XSS patterns
   */
  private containsXSS(value: string): boolean {
    const xssPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi, // Event handlers like onclick=
      /<iframe/gi,
    ];

    return xssPatterns.some(pattern => pattern.test(value));
  }

  /**
   * Check for path traversal patterns
   */
  private containsPathTraversal(value: string): boolean {
    const pathPatterns = [
      /\.\.\//,
      /\.\.\\/,
      /%2e%2e%2f/i,
      /%2e%2e\//i,
    ];

    return pathPatterns.some(pattern => pattern.test(value));
  }

  /**
   * Sanitize data for logging (remove sensitive fields)
   */
  private sanitizeForLog(data: any): any {
    const sensitiveFields = ['password', 'apiKey', 'secret', 'token', 'apiSecret'];
    const sanitized = { ...data };

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }
}

// Singleton instance
export const inputValidator = new InputValidator();

// Common validation schemas
export const symbolSchema: ValidationSchema = {
  symbol: {
    type: 'string',
    required: true,
    pattern: /^[A-Z]{3,10}$/,
    min: 3,
    max: 10,
  },
};

export const tradeSchema: ValidationSchema = {
  symbol: {
    type: 'string',
    required: true,
    pattern: /^[A-Z]{3,10}$/,
  },
  side: {
    type: 'string',
    required: true,
    enum: ['BUY', 'SELL'],
  },
  quantity: {
    type: 'number',
    required: true,
    min: 0,
  },
  price: {
    type: 'number',
    required: false,
    min: 0,
  },
};

export const paginationSchema: ValidationSchema = {
  page: {
    type: 'number',
    required: false,
    min: 1,
    max: 10000,
  },
  limit: {
    type: 'number',
    required: false,
    min: 1,
    max: 100,
  },
};
