import client from 'prom-client';

/**
 * Metrics Service - Prometheus metrics for observability
 */

// Create registry
export const register = new client.Registry();

// Collect default metrics (CPU, memory, etc.)
client.collectDefaultMetrics({ register });

// HTTP request latency histogram
export const reqLatency = new client.Histogram({
  name: 'http_request_duration_ms',
  help: 'HTTP request latency in milliseconds',
  buckets: [50, 100, 250, 500, 1000, 2500, 5000],
  labelNames: ['route', 'method', 'code'],
});
register.registerMetric(reqLatency);

// Order submission counter
export const orderSuccess = new client.Counter({
  name: 'orders_submitted_total',
  help: 'Total orders submitted to exchange',
  labelNames: ['type', 'status', 'symbol'],
});
register.registerMetric(orderSuccess);

// Signal generation counter
export const signalsGenerated = new client.Counter({
  name: 'signals_generated_total',
  help: 'Total trading signals generated',
  labelNames: ['playbook', 'action', 'symbol'],
});
register.registerMetric(signalsGenerated);

// ML decision counter
export const mlDecisions = new client.Counter({
  name: 'ml_decisions_total',
  help: 'Total ML signal decisions',
  labelNames: ['decision', 'playbook'],
});
register.registerMetric(mlDecisions);

// Position counter
export const positionsGauge = new client.Gauge({
  name: 'positions_open',
  help: 'Number of currently open positions',
});
register.registerMetric(positionsGauge);

// Equity gauge
export const equityGauge = new client.Gauge({
  name: 'account_equity_usd',
  help: 'Current account equity in USD',
});
register.registerMetric(equityGauge);

// PnL gauge
export const pnlGauge = new client.Gauge({
  name: 'account_pnl_usd',
  help: 'Current account PnL in USD',
  labelNames: ['period'], // 'daily' or 'weekly'
});
register.registerMetric(pnlGauge);

// Scan cycle duration histogram
export const scanCycleDuration = new client.Histogram({
  name: 'scan_cycle_duration_ms',
  help: 'Scan cycle duration in milliseconds',
  buckets: [1000, 2500, 5000, 10000, 15000, 30000],
});
register.registerMetric(scanCycleDuration);

// API call counter
export const apiCalls = new client.Counter({
  name: 'binance_api_calls_total',
  help: 'Total Binance API calls',
  labelNames: ['endpoint', 'method', 'status'],
});
register.registerMetric(apiCalls);

// WebSocket connection gauge
export const wsConnected = new client.Gauge({
  name: 'websocket_connected',
  help: 'WebSocket connection status (1=connected, 0=disconnected)',
  labelNames: ['stream'],
});
register.registerMetric(wsConnected);

// Slippage histogram
export const slippageHistogram = new client.Histogram({
  name: 'order_slippage_bps',
  help: 'Order slippage in basis points',
  buckets: [0, 5, 10, 25, 50, 100, 250, 500],
  labelNames: ['symbol', 'type'],
});
register.registerMetric(slippageHistogram);

// Fill rate gauge
export const fillRate = new client.Gauge({
  name: 'order_fill_rate',
  help: 'Order fill rate (filled/submitted)',
  labelNames: ['period'], // '1h', '24h', '7d'
});
register.registerMetric(fillRate);

/**
 * Helper functions to update metrics
 */

export function recordHttpRequest(route: string, method: string, code: number, durationMs: number) {
  reqLatency.labels(route, method, code.toString()).observe(durationMs);
}

export function recordOrderSubmission(type: string, status: string, symbol: string) {
  orderSuccess.labels(type, status, symbol).inc();
}

export function recordSignal(playbook: string, action: string, symbol: string) {
  signalsGenerated.labels(playbook, action, symbol).inc();
}

export function recordMLDecision(decision: 'approved' | 'rejected', playbook: string) {
  mlDecisions.labels(decision, playbook).inc();
}

export function updatePositionsCount(count: number) {
  positionsGauge.set(count);
}

export function updateEquity(equity: number) {
  equityGauge.set(equity);
}

export function updatePnL(period: 'daily' | 'weekly', pnl: number) {
  pnlGauge.labels(period).set(pnl);
}

export function recordScanCycle(durationMs: number) {
  scanCycleDuration.observe(durationMs);
}

export function recordApiCall(endpoint: string, method: string, status: number) {
  apiCalls.labels(endpoint, method, status.toString()).inc();
}

export function updateWebSocketStatus(stream: string, connected: boolean) {
  wsConnected.labels(stream).set(connected ? 1 : 0);
}

export function recordSlippage(symbol: string, type: string, slippageBps: number) {
  slippageHistogram.labels(symbol, type).observe(slippageBps);
}

export function updateFillRate(period: string, rate: number) {
  fillRate.labels(period).set(rate);
}

export default {
  register,
  recordHttpRequest,
  recordOrderSubmission,
  recordSignal,
  recordMLDecision,
  updatePositionsCount,
  updateEquity,
  updatePnL,
  recordScanCycle,
  recordApiCall,
  updateWebSocketStatus,
  recordSlippage,
  updateFillRate,
};

