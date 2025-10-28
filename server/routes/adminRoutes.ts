import express, { Request, Response } from 'express';
import BotState from '../models/BotState';

const router = express.Router();

/**
 * Update starting equity for bot
 * POST /api/admin/bot/starting-equity
 */
router.post('/bot/starting-equity', async (req: Request, res: Response) => {
  try {
    const { startingEquity } = req.body;
    
    if (!startingEquity || startingEquity <= 0) {
      return res.status(400).json({ error: 'Invalid starting equity' });
    }

    const botState = await BotState.findOne();
    if (!botState) {
      return res.status(404).json({ error: 'Bot state not found' });
    }

    botState.startingEquity = startingEquity;
    
    // Calculate currentR if not set
    if (!botState.currentR || botState.currentR <= 0) {
      botState.currentR = botState.equity * 0.006;
    }
    
    await botState.save();

    console.log(`[Admin] Updated starting equity to $${startingEquity}, currentR to $${botState.currentR}`);

    res.json({
      success: true,
      message: 'Starting equity updated',
      data: {
        startingEquity: botState.startingEquity,
        currentR: botState.currentR,
        equity: botState.equity
      }
    });
  } catch (error) {
    console.error('[Admin] Error updating starting equity:', error);
    res.status(500).json({ error: 'Failed to update starting equity' });
  }
});

/**
 * Initialize bot state
 * POST /api/admin/bot/initialize
 */
router.post('/bot/initialize', async (req: Request, res: Response) => {
  try {
    const botState = await BotState.findOne();
    if (!botState) {
      return res.status(404).json({ error: 'Bot state not found' });
    }

    // Set starting equity if not set
    if (!botState.startingEquity || botState.startingEquity <= 0) {
      botState.startingEquity = process.env.STARTING_EQUITY ? parseFloat(process.env.STARTING_EQUITY) : 15000;
    }

    // Calculate currentR if not set
    if (!botState.currentR || botState.currentR <= 0) {
      botState.currentR = botState.equity * 0.006;
    }

    await botState.save();

    console.log(`[Admin] Initialized bot state: startingEquity=$${botState.startingEquity}, currentR=$${botState.currentR}`);

    res.json({
      success: true,
      message: 'Bot state initialized',
      data: {
        startingEquity: botState.startingEquity,
        currentR: botState.currentR,
        equity: botState.equity
      }
    });
  } catch (error) {
    console.error('[Admin] Error initializing bot state:', error);
    res.status(500).json({ error: 'Failed to initialize bot state' });
  }
});

export default router;

