import dotenv from 'dotenv';
import express from 'express';
import { Request, Response, NextFunction } from 'express';
// Validate environment variables at boot (will throw if invalid)
import { env } from './config/env';
import exchangeFilters from './services/exchangeFilters';
import { slackNotifier } from './services/slackNotifier';
import { metricsService } from './services/metricsService';
import path from 'path';
import { fileURLToPath } from 'url';
import basicRoutes from './routes/index';
import authRoutes from './routes/authRoutes';
import positionRoutes from './routes/positionRoutes';
import tradeRoutes from './routes/tradeRoutes';
import botRoutes from './routes/botRoutes';
import signalRoutes from './routes/signalRoutes';
import alertRoutes from './routes/alertRoutes';
import configRoutes from './routes/configRoutes';
import analyticsRoutes from './routes/analyticsRoutes';
import taxReportRoutes from './routes/taxReportRoutes';
import engineRoutes from './routes/engineRoutes';
import ppoRoutes from './routes/ppoRoutes';
import mlRoutes from './routes/mlRoutes';
import mlMetricsRoutes from './routes/mlMetricsRoutes';
import manualTradeRoutes from './routes/manualTradeRoutes';
import capitalAllocationRoutes from './routes/capitalAllocationRoutes';
import orderReconciliationRoutes from './routes/orderReconciliationRoutes';
import strategyDriftRoutes from './routes/strategyDriftRoutes';
import rateLimitRoutes from './routes/rateLimitRoutes';
import riskRoutes from './routes/riskRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import controlRoutes from './routes/controlRoutes';
import positionControlRoutes from './routes/positionControlRoutes';
import transactionRoutes from './routes/transactions';
import botActivityRoutes from './routes/botActivityRoutes';
import snapshotRoutes from './routes/snapshotRoutes';
import adminRoutes from './routes/adminRoutes';
import { connectDB } from './config/database';
import { initializeSnapshotCron } from './utils/snapshotCron';
// import { initializeDailyReportCron } from './cron/dailyReportCron';
import cors from 'cors';
import { register as metricsRegister, recordHttpRequest } from './utils/metrics';
import logger from './utils/logger';
import positionMgmtRunner from "./runPositionManagement";
import orderReconciliationService from './services/orderReconciliationService';
import strategyDriftDetector from './services/strategyDriftDetector';
import gracefulShutdownManager from './services/gracefulShutdownManager';
// Load environment variables
dotenv.config();
if (!process.env.MONGO_URI && !process.env.DATABASE_URL) {
  console.error("Error: MONGO_URI or DATABASE_URL environment variable is missing.");
  process.exit(-1);
}
const app = express();
const port = process.env.PORT || 3000;
// Pretty-print JSON responses
app.enable('json spaces');
// We want to be consistent with URL paths, so we enable strict routing
app.enable('strict routing');
// Disable ETag generation to prevent 304 Not Modified responses
app.set('etag', false);
app.use(cors({}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// HTTP request metrics middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    recordHttpRequest(req.route?.path || req.path, req.method, res.statusCode, duration);
  });
  next();
});
// Disable caching for API routes
app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});
// Database connection
connectDB();
app.on("error", (error: Error) => {
  console.error(`Server error: ${error.message}`);
  console.error(error.stack);
});
// API Routes
app.use('/api/health', basicRoutes);
// Authentication Routes
app.use('/api/auth', authRoutes);
// Dashboard Routes (NEW - Phase 1)
app.use('/api/dashboard', dashboardRoutes);
// Control Routes (NEW - Phase 1)
app.use('/api/control', controlRoutes);
// Position Control Routes (NEW - Phase 1) - Must come before /api/positions
app.use('/api/positions', positionControlRoutes);
// Position Routes
app.use('/api/positions', positionRoutes);
// Trade Routes
app.use('/api/trades', tradeRoutes);
app.use('/api/transactions', transactionRoutes);
// Bot Routes
app.use('/api/bot', botRoutes);
app.use('/api/bot', botActivityRoutes);
// Signal Routes
app.use('/api/signals', signalRoutes);
// Alert Routes
app.use('/api/alerts', alertRoutes);
// Config Routes
app.use('/api/config', configRoutes);
// Analytics Routes
app.use('/api/analytics', analyticsRoutes);
// Tax Report Routes
app.use('/api/tax', taxReportRoutes);
// Engine Routes
app.use('/api/engine', engineRoutes);
// PPO Routes
app.use('/api/ppo', ppoRoutes);
// ML Routes
app.use('/api/ml', mlRoutes);
// ML Metrics Routes
app.use('/api/ml-metrics', mlMetricsRoutes);
// Admin routes
app.use('/api/admin/snapshot', snapshotRoutes);
app.use('/api/admin', adminRoutes);
// Manual Trade Routes (NEW - Phase 1)
app.use('/api/trade', manualTradeRoutes);
// Risk Routes
app.use('/api/risk', riskRoutes);
app.use('/api', capitalAllocationRoutes);
app.use('/api/reconciliation', orderReconciliationRoutes);
app.use('/api/drift', strategyDriftRoutes);
app.use('/api/rate-limit', rateLimitRoutes);
// Prometheus Metrics Endpoint
app.get('/metrics', async (req: Request, res: Response) => {
  try {
    res.set('Content-Type', metricsRegister.contentType);
    res.end(await metricsRegister.metrics());
  } catch (error) {
    logger.error({ error }, 'Error generating metrics');
    res.status(500).send('Error generating metrics');
  }
});
// Trading Metrics Endpoint for Grafana
app.get('/api/metrics', (req: Request, res: Response) => {
  metricsService.metricsEndpoint(req, res);
});
// Health check endpoint
app.get('/healthz', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});
// Serve static files from React app in production
// Use dynamic path based on environment
const clientDistPath = process.env.CLIENT_DIST_PATH || 
  (process.env.NODE_ENV === 'production' && process.env.DOCKER_ENV === 'true'
    ? path.join('/app/client/dist')
    : path.join('/opt/binance-bot/client/dist'));
console.log('Serving static files from:', clientDistPath);
app.use(express.static(clientDistPath));
// Handle React routing, return all requests to React app
// Error handling
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(`Unhandled application error: ${err.message}`);
  console.error(err.stack);
  res.status(500).send("There was an error serving your request.");
});
// Handle React routing - MUST be last (after all API routes)
app.get('*', (req: Request, res: Response) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

const server = app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  
  // Register server with graceful shutdown manager
  gracefulShutdownManager.registerServer(server);
  gracefulShutdownManager.registerSignalHandlers();
  console.log('[GracefulShutdown] Graceful shutdown handlers registered');

  // Initialize daily snapshot cron job
  initializeSnapshotCron();
  // Initialize position management (every 5 minutes)
  positionMgmtRunner.startScheduled();
  
  // Initialize order reconciliation (every 5 minutes)
  orderReconciliationService.startAutoReconciliation();
  
  // Initialize strategy drift detection (every 24 hours)
  strategyDriftDetector.startAutoDriftDetection(24);
  
  // Load exchange filters and start daily refresh
  (async () => {
    try {
      await exchangeFilters.loadFilters();
      exchangeFilters.startDailyRefresh();
    } catch (error: any) {
      console.error('[Server] Failed to load exchange filters:', error.message);
    }
  })();

  // Send Slack startup notification
  (async () => {
    try {
      // Send test notification first
      await slackNotifier.sendTestNotification();
      
      // Then send startup notification
      // Get current equity from BotState
      const BotState = (await import('./models/BotState')).default;
      const state = await BotState.findOne({});
      const equity = state?.equity || 0;
      
      await slackNotifier.notifyStartup('v2.0.0', equity);
      console.log('[Server] Slack notifications initialized');
    } catch (error: any) {
      console.error('[Server] Failed to send Slack notifications:', error.message);
    }
  })();

  
  // Initialize daily P&L report cron job
  // initializeDailyReportCron(); // Disabled until dependencies are installed
});

