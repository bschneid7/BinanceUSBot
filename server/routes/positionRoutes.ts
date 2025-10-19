import express, { Request, Response } from 'express';
import { requireUser } from './middlewares/auth';
import PositionService from '../services/positionService';
import { ALL_ROLES } from 'shared';
import mongoose from 'mongoose';

const router = express.Router();

interface AuthRequest extends Request {
  user?: {
    _id: string;
    email: string;
    role: string;
  };
}

// Description: Get active positions
// Endpoint: GET /api/positions/active
// Request: {}
// Response: { positions: Position[] }
router.get('/active', requireUser(ALL_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    console.log(`[GET /api/positions/active] Request from user: ${req.user?._id}`);

    if (!req.user?._id) {
      console.error('[GET /api/positions/active] User ID not found in request');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const positions = await PositionService.getActivePositions(req.user._id);

    console.log(`[GET /api/positions/active] Returning ${positions.length} active positions`);
    return res.status(200).json({ positions });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[GET /api/positions/active] Error:`, error);
    return res.status(500).json({ error: `Failed to fetch active positions: ${errorMessage}` });
  }
});

// Description: Get all positions with optional filters
// Endpoint: GET /api/positions
// Request: { status?: string, playbook?: string, symbol?: string }
// Response: { positions: Position[] }
router.get('/', requireUser(ALL_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    console.log(`[GET /api/positions] Request from user: ${req.user?._id}`, req.query);

    if (!req.user?._id) {
      console.error('[GET /api/positions] User ID not found in request');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { status, playbook, symbol } = req.query;
    const filters = {
      status: status as string | undefined,
      playbook: playbook as string | undefined,
      symbol: symbol as string | undefined,
    };

    const positions = await PositionService.getAllPositions(req.user._id, filters);

    // Add computed totalValue field and format numbers
    const positionsWithValue = positions.map(pos => {
      const posObj = pos.toObject();
      const currentPrice = posObj.current_price || posObj.entry_price;
      posObj.totalValue = currentPrice * posObj.quantity;
      
      // Round stop_price to 4 significant digits
      if (posObj.stop_price) {
        posObj.stop_price = parseFloat(posObj.stop_price.toPrecision(4));
      }
      
      return posObj;
    });

    console.log(`[GET /api/positions] Returning ${positions.length} positions`);
    return res.status(200).json({ positions: positionsWithValue });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[GET /api/positions] Error:`, error);
    return res.status(500).json({ error: `Failed to fetch positions: ${errorMessage}` });
  }
});

// Description: Get a single position by ID
// Endpoint: GET /api/positions/:id
// Request: {}
// Response: { position: Position }
router.get('/:id', requireUser(ALL_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    console.log(`[GET /api/positions/${id}] Request from user: ${req.user?._id}`);

    if (!req.user?._id) {
      console.error(`[GET /api/positions/${id}] User ID not found in request`);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const position = await PositionService.getPositionById(id, req.user._id);

    if (!position) {
      console.log(`[GET /api/positions/${id}] Position not found`);
      return res.status(404).json({ error: 'Position not found' });
    }

    console.log(`[GET /api/positions/${id}] Returning position`);
    return res.status(200).json({ position });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[GET /api/positions/${req.params.id}] Error:`, error);
    return res.status(500).json({ error: `Failed to fetch position: ${errorMessage}` });
  }
});

// Description: Create a new position
// Endpoint: POST /api/positions
// Request: { symbol, side, entry_price, quantity, stop_price, target_price?, trailing_stop_distance?, playbook }
// Response: { position: Position }
router.post('/', requireUser(ALL_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    console.log(`[POST /api/positions] Request from user: ${req.user?._id}`, req.body);

    if (!req.user?._id) {
      console.error('[POST /api/positions] User ID not found in request');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { symbol, side, entry_price, quantity, stop_price, target_price, trailing_stop_distance, playbook } = req.body;

    // Validate required fields
    if (!symbol || !side || !entry_price || !quantity || !stop_price || !playbook) {
      console.error('[POST /api/positions] Missing required fields');
      return res.status(400).json({ error: 'Missing required fields: symbol, side, entry_price, quantity, stop_price, playbook' });
    }

    // Validate enums
    if (!['LONG', 'SHORT'].includes(side)) {
      console.error('[POST /api/positions] Invalid side value');
      return res.status(400).json({ error: 'Invalid side. Must be LONG or SHORT' });
    }

    if (!['A', 'B', 'C', 'D'].includes(playbook)) {
      console.error('[POST /api/positions] Invalid playbook value');
      return res.status(400).json({ error: 'Invalid playbook. Must be A, B, C, or D' });
    }

    const position = await PositionService.createPosition({
      symbol,
      side,
      entry_price: parseFloat(entry_price),
      quantity: parseFloat(quantity),
      stop_price: parseFloat(stop_price),
      target_price: target_price ? parseFloat(target_price) : undefined,
      trailing_stop_distance: trailing_stop_distance ? parseFloat(trailing_stop_distance) : undefined,
      playbook,
      userId: new mongoose.Types.ObjectId(req.user._id),
      status: 'OPEN',
    });

    console.log(`[POST /api/positions] Position created successfully`);
    return res.status(201).json({ position });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[POST /api/positions] Error:`, error);
    return res.status(500).json({ error: `Failed to create position: ${errorMessage}` });
  }
});

// Description: Update a position
// Endpoint: PUT /api/positions/:id
// Request: { current_price?, unrealized_pnl?, unrealized_r?, hold_time?, stop_price?, target_price?, trailing_stop_distance?, status? }
// Response: { position: Position }
router.put('/:id', requireUser(ALL_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    console.log(`[PUT /api/positions/${id}] Request from user: ${req.user?._id}`, req.body);

    if (!req.user?._id) {
      console.error(`[PUT /api/positions/${id}] User ID not found in request`);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const position = await PositionService.updatePosition(id, req.user._id, req.body);

    if (!position) {
      console.log(`[PUT /api/positions/${id}] Position not found`);
      return res.status(404).json({ error: 'Position not found' });
    }

    console.log(`[PUT /api/positions/${id}] Position updated successfully`);
    return res.status(200).json({ position });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[PUT /api/positions/${req.params.id}] Error:`, error);
    return res.status(500).json({ error: `Failed to update position: ${errorMessage}` });
  }
});

// Description: Delete a position
// Endpoint: DELETE /api/positions/:id
// Request: {}
// Response: { success: boolean, message: string }
router.delete('/:id', requireUser(ALL_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    console.log(`[DELETE /api/positions/${id}] Request from user: ${req.user?._id}`);

    if (!req.user?._id) {
      console.error(`[DELETE /api/positions/${id}] User ID not found in request`);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const deleted = await PositionService.deletePosition(id, req.user._id);

    if (!deleted) {
      console.log(`[DELETE /api/positions/${id}] Position not found`);
      return res.status(404).json({ error: 'Position not found' });
    }

    console.log(`[DELETE /api/positions/${id}] Position deleted successfully`);
    return res.status(200).json({ success: true, message: 'Position deleted successfully' });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[DELETE /api/positions/${req.params.id}] Error:`, error);
    return res.status(500).json({ error: `Failed to delete position: ${errorMessage}` });
  }
});

export default router;
