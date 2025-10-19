import dotenv from 'dotenv';
import express from 'express';
import { Request, Response } from 'express';
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
import { connectDB } from './config/database';
import cors from 'cors';

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

app.use(cors({}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
// Position Routes
app.use('/api/positions', positionRoutes);
// Trade Routes
app.use('/api/trades', tradeRoutes);
// Bot Routes
app.use('/api/bot', botRoutes);
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
app.use((err: Error, req: Request, res: Response) => {
  console.error(`Unhandled application error: ${err.message}`);
  console.error(err.stack);
  res.status(500).send("There was an error serving your request.");
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
