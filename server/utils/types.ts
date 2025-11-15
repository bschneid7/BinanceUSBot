/**
 * Trading Bot Type Definitions
 * 
 * Centralized type definitions to replace 'any' types throughout the codebase.
 */

import { Types } from 'mongoose';

// ============================================================================
// POSITION TYPES
// ============================================================================

export type PositionSide = 'LONG' | 'SHORT';
export type PositionStatus = 'OPEN' | 'CLOSING' | 'CLOSED';
export type CloseReason = 'STOP_LOSS' | 'TARGET' | 'MANUAL' | 'KILL_SWITCH' | 'TIME_STOP' | 'AUTO_CLOSE_NO_STOP' | 'AUTO_CLOSE_STALE' | 'DUST';

export interface Position {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  symbol: string;
  side: PositionSide;
  status: PositionStatus;
  playbook: string;
  entry_price: number;
  current_price: number;
  stop_price: number;
  target_price?: number;
  quantity: number;
  unrealized_pnl?: number;
  realized_pnl?: number;
  realized_r?: number;
  fees_paid?: number;
  opened_at: Date;
  closed_at?: Date;
  close_reason?: CloseReason;
  close_price?: number;
  closingStartedAt?: Date;
}

// ============================================================================
// ORDER TYPES
// ============================================================================

export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT' | 'LIMIT_MAKER';
export type OrderStatus = 'NEW' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELED' | 'REJECTED' | 'EXPIRED';
export type TimeInForce = 'GTC' | 'IOC' | 'FOK';

export interface Order {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price?: number;
  status: OrderStatus;
  timeInForce?: TimeInForce;
  binanceOrderId?: string;
  executedQty?: number;
  executedPrice?: number;
  fees?: number;
  createdAt: Date;
  updatedAt?: Date;
}

// ============================================================================
// SIGNAL TYPES
// ============================================================================

export type SignalAction = 'BUY' | 'SELL';

export interface Signal {
  symbol: string;
  playbook: string;
  action: SignalAction;
  entryPrice: number;
  stopPrice: number;
  targetPrice?: number;
  reason: string;
  confidence?: number;
  timestamp?: Date;
}

export interface SignalGenerationResult {
  signals: Signal[];
  scannedMarkets: number;
  passedGates: number;
  timestamp: Date;
}

// ============================================================================
// EXECUTION TYPES
// ============================================================================

export interface ExecutionResult {
  success: boolean;
  orderId?: Types.ObjectId;
  binanceOrderId?: string;
  executedQty?: number;
  executedPrice?: number;
  fees?: number;
  error?: string;
}

export interface ExecutionParams {
  userId: Types.ObjectId;
  signal: Signal;
  quantity: number;
  positionId?: Types.ObjectId;
}

// ============================================================================
// MARKET DATA TYPES
// ============================================================================

export interface Ticker {
  symbol: string;
  price: number;
  volume24h: number;
  priceChange24h: number;
  priceChangePercent24h: number;
  high24h: number;
  low24h: number;
  timestamp: Date;
}

export interface OrderBook {
  symbol: string;
  bids: [number, number][]; // [price, quantity]
  asks: [number, number][]; // [price, quantity]
  timestamp: Date;
}

export interface Candle {
  symbol: string;
  interval: string;
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketQuality {
  symbol: string;
  passed: boolean;
  price: number;
  volume24h: number;
  spread: number;
  spreadBps: number;
  tobDepth: number;
  atr: number;
  failReasons?: string[];
}

// ============================================================================
// EXCHANGE FILTER TYPES
// ============================================================================

export interface LotSizeFilter {
  minQty: string;
  maxQty: string;
  stepSize: string;
}

export interface PriceFilter {
  minPrice: string;
  maxPrice: string;
  tickSize: string;
}

export interface MinNotionalFilter {
  minNotional: string;
}

export interface ExchangeFilters {
  lotSizeFilter?: LotSizeFilter;
  priceFilter?: PriceFilter;
  minNotionalFilter?: MinNotionalFilter;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// ============================================================================
// BOT STATE TYPES
// ============================================================================

export interface BotState {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  isRunning: boolean;
  startingEquity: number;
  currentEquity: number;
  equity: number;
  currentR: number;
  openPositions: number;
  totalPnL: number;
  dailyPnl: number;
  dailyPnlR: number;
  weeklyPnl: number;
  weeklyPnlR: number;
  lastUpdate: Date;
}

// ============================================================================
// TRADE TYPES
// ============================================================================

export type TradeOutcome = 'WIN' | 'LOSS' | 'BREAKEVEN';

export interface Trade {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  symbol: string;
  side: PositionSide;
  playbook: string;
  entry_price: number;
  exit_price: number;
  quantity: number;
  pnl_usd: number;
  pnl_r: number;
  fees: number;
  date: Date;
  outcome: TradeOutcome;
  notes?: string;
}

// ============================================================================
// ALERT TYPES
// ============================================================================

export type AlertType = 'INFO' | 'WARNING' | 'STOP_LOSS' | 'TARGET' | 'CRITICAL';

export interface Alert {
  type: AlertType;
  message: string;
  timestamp?: Date;
}

// ============================================================================
// BINANCE API TYPES
// ============================================================================

export interface BinanceOrderResponse {
  symbol: string;
  orderId: number;
  orderListId: number;
  clientOrderId: string;
  transactTime: number;
  price: string;
  origQty: string;
  executedQty: string;
  cummulativeQuoteQty: string;
  status: OrderStatus;
  timeInForce: TimeInForce;
  type: OrderType;
  side: OrderSide;
  fills?: BinanceFill[];
}

export interface BinanceFill {
  price: string;
  qty: string;
  commission: string;
  commissionAsset: string;
}

export interface BinanceAccountInfo {
  makerCommission: number;
  takerCommission: number;
  buyerCommission: number;
  sellerCommission: number;
  canTrade: boolean;
  canWithdraw: boolean;
  canDeposit: boolean;
  updateTime: number;
  accountType: string;
  balances: BinanceBalance[];
}

export interface BinanceBalance {
  asset: string;
  free: string;
  locked: string;
}

export interface BinanceExchangeInfo {
  timezone: string;
  serverTime: number;
  rateLimits: BinanceRateLimit[];
  symbols: BinanceSymbolInfo[];
}

export interface BinanceRateLimit {
  rateLimitType: string;
  interval: string;
  intervalNum: number;
  limit: number;
}

export interface BinanceSymbolInfo {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
  filters: any[];
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export interface BinanceError {
  code: number;
  msg: string;
}

export interface TradingError extends Error {
  code?: string;
  symbol?: string;
  orderId?: string;
  details?: any;
}

// ============================================================================
// LOGGING TYPES
// ============================================================================

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';

export interface LogEntry {
  level: LogLevel;
  timestamp: Date;
  message: string;
  context?: string;
  metadata?: Record<string, any>;
  error?: Error;
}

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

export interface RiskConfig {
  defaultRPercentage: number;
  maxRPerTrade: number;
  maxOpenR: number;
  fallbackRValue: number;
}

export interface PositionConfig {
  maxPriceDeviationPct: number;
  priceDecayThresholdPct: number;
  minPositionValueUsd: number;
  defaultStopLossPct: number;
  defaultTargetPct: number;
}

export interface BotConfig {
  risk: RiskConfig;
  position: PositionConfig;
  // Add more config sections as needed
}

// ============================================================================
// HELPER TYPE GUARDS
// ============================================================================

export function isPosition(obj: any): obj is Position {
  return obj && 
    typeof obj.symbol === 'string' &&
    typeof obj.side === 'string' &&
    typeof obj.status === 'string' &&
    typeof obj.entry_price === 'number';
}

export function isSignal(obj: any): obj is Signal {
  return obj &&
    typeof obj.symbol === 'string' &&
    typeof obj.playbook === 'string' &&
    typeof obj.action === 'string' &&
    typeof obj.entryPrice === 'number';
}

export function isBinanceError(obj: any): obj is BinanceError {
  return obj && typeof obj.code === 'number' && typeof obj.msg === 'string';
}

export function isExecutionResult(obj: any): obj is ExecutionResult {
  return obj && typeof obj.success === 'boolean';
}
