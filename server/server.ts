import dotenv from 'dotenv';
import express from 'express';
import { Request, Response, NextFunction } from 'express';
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
app.get('*', (req: Request, res: Response) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});
// Error handling
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(`Unhandled application error: ${err.message}`);
  console.error(err.stack);
  res.status(500).send("There was an error serving your request.");
});
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  
  // Initialize daily snapshot cron job
  initializeSnapshotCron();
  
  // Initialize daily P&L report cron job
  // initializeDailyReportCron(); // Disabled until dependencies are installed
});

