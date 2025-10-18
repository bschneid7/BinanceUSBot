import express from 'express';
import { requireUser } from './middlewares/auth';
import tradingEngine from '../services/tradingEngine';

const router = express.Router();

// Description: Start the trading engine
// Endpoint: POST /api/engine/start
// Request: {}
// Response: { success: boolean, message: string, status: object }
router.post('/start', requireUser(), async (req, res) => {
  try {
    console.log(`[EngineRoutes] Start engine request from user ${req.user._id}`);

    await tradingEngine.start(req.user._id);
    const status = await tradingEngine.getStatus(req.user._id);

    res.status(200).json({
      success: true,
      message: 'Trading engine started successfully',
      status,
    });
  } catch (error) {
    console.error('[EngineRoutes] Error starting engine:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      success: false,
      error: `Failed to start trading engine: ${errorMessage}`,
    });
  }
});

// Description: Stop the trading engine
// Endpoint: POST /api/engine/stop
// Request: {}
// Response: { success: boolean, message: string, status: object }
router.post('/stop', requireUser(), async (req, res) => {
  try {
    console.log(`[EngineRoutes] Stop engine request from user ${req.user._id}`);

    await tradingEngine.stop(req.user._id);
    const status = await tradingEngine.getStatus(req.user._id);

    res.status(200).json({
      success: true,
      message: 'Trading engine stopped successfully',
      status,
    });
  } catch (error) {
    console.error('[EngineRoutes] Error stopping engine:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      success: false,
      error: `Failed to stop trading engine: ${errorMessage}`,
    });
  }
});

// Description: Get trading engine status
// Endpoint: GET /api/engine/status
// Request: {}
// Response: { isRunning: boolean, lastScanTimestamp?: Date, lastSignalTimestamp?: Date }
router.get('/status', requireUser(), async (req, res) => {
  try {
    console.log(`[EngineRoutes] Status request from user ${req.user._id}`);

    const status = await tradingEngine.getStatus(req.user._id);

    res.status(200).json(status);
  } catch (error) {
    console.error('[EngineRoutes] Error getting engine status:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: `Failed to get engine status: ${errorMessage}`,
    });
  }
});

export default router;
