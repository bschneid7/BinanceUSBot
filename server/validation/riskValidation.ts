import { z } from 'zod';

/**
 * Zod Validation Schemas for Risk Management API
 * 
 * Provides type-safe request validation with detailed error messages
 */

// Playbook enum
export const PlaybookSchema = z.enum(['A', 'B', 'C', 'D'], {
  errorMap: () => ({ message: 'Playbook must be one of: A, B, C, D' })
});

// Trading side enum
export const TradingSideSchema = z.enum(['LONG', 'SHORT'], {
  errorMap: () => ({ message: 'Side must be either LONG or SHORT' })
});

// Symbol validation (uppercase, ends with USD or USDT)
export const SymbolSchema = z.string()
  .min(6)
  .max(12)
  .regex(/^[A-Z]+USD[T]?$/, 'Symbol must be uppercase and end with USD or USDT')
  .transform(s => s.toUpperCase());

// Stop loss distance (0.1% to 50%)
export const StopLossDistanceSchema = z.number()
  .min(0.001, 'Stop loss distance must be at least 0.1%')
  .max(0.5, 'Stop loss distance cannot exceed 50%');

// Position size (min $100, max $1M)
export const PositionSizeSchema = z.number()
  .min(100, 'Position size must be at least $100')
  .max(1000000, 'Position size cannot exceed $1,000,000');

// Price validation (positive number)
export const PriceSchema = z.number()
  .positive('Price must be positive');

// ATR multiplier (0.5 to 5.0)
export const ATRMultiplierSchema = z.number()
  .min(0.5, 'ATR multiplier must be at least 0.5')
  .max(5.0, 'ATR multiplier cannot exceed 5.0')
  .optional()
  .default(2.0);

/**
 * Kelly Size Request Schema
 * POST /api/risk/kelly-size
 */
export const KellySizeRequestSchema = z.object({
  symbol: SymbolSchema,
  playbook: PlaybookSchema,
  stopLossDistance: StopLossDistanceSchema
}).strict();

export type KellySizeRequest = z.infer<typeof KellySizeRequestSchema>;

/**
 * Pre-Trade Check Request Schema
 * POST /api/risk/pre-trade-check
 */
export const PreTradeCheckRequestSchema = z.object({
  symbol: SymbolSchema,
  playbook: PlaybookSchema,
  proposedSize: PositionSizeSchema,
  stopLossDistance: StopLossDistanceSchema
}).strict();

export type PreTradeCheckRequest = z.infer<typeof PreTradeCheckRequestSchema>;

/**
 * Dynamic Stop Request Schema
 * POST /api/risk/dynamic-stop
 */
export const DynamicStopRequestSchema = z.object({
  symbol: SymbolSchema,
  entryPrice: PriceSchema,
  side: TradingSideSchema,
  atrMultiplier: ATRMultiplierSchema
}).strict();

export type DynamicStopRequest = z.infer<typeof DynamicStopRequestSchema>;

/**
 * Validation middleware factory
 * Creates Express middleware for request body validation
 */
export function validateRequest<T>(schema: z.ZodSchema<T>) {
  return (req: any, res: any, next: any) => {
    try {
      const validated = schema.parse(req.body);
      req.validatedBody = validated;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }));
        
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors
        });
      }
      
      return res.status(500).json({
        success: false,
        error: 'Internal validation error'
      });
    }
  };
}

/**
 * Query parameter validation
 */
export const PaginationSchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().min(1)).optional().default('1'),
  limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().min(1).max(100)).optional().default('20')
});

export type PaginationQuery = z.infer<typeof PaginationSchema>;

/**
 * Date range validation
 */
export const DateRangeSchema = z.object({
  startDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  endDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
}).refine(
  data => new Date(data.startDate) <= new Date(data.endDate),
  { message: 'Start date must be before or equal to end date' }
);

export type DateRange = z.infer<typeof DateRangeSchema>;

