import express, { Request, Response } from 'express';
import { requireUser } from './middlewares/auth';
import * as ConfigService from '../services/configService';

const router = express.Router();

// Description: Get bot configuration for authenticated user
// Endpoint: GET /api/config
// Request: {}
// Response: { config: BotConfig }
router.get('/', requireUser(), async (req: Request, res: Response) => {
  try {
    console.log(`[GET /api/config] Fetching config for user: ${req.user._id}`);

    const config = await ConfigService.getUserConfig(req.user._id);

    console.log(`[GET /api/config] Config retrieved successfully for user: ${req.user._id}`);
    res.status(200).json({ config });
  } catch (error) {
    const err = error as Error;
    console.error(`[GET /api/config] Error fetching config:`, err.message);
    console.error(err.stack);
    res.status(500).json({
      error: 'Failed to fetch configuration',
      message: err.message
    });
  }
});

// Description: Update bot configuration for authenticated user
// Endpoint: PUT /api/config
// Request: { scanner?, risk?, reserve?, playbook_A?, playbook_B?, playbook_C?, playbook_D? }
// Response: { success: boolean, message: string, config: BotConfig }
router.put('/', requireUser(), async (req: Request, res: Response) => {
  try {
    console.log(`[PUT /api/config] Updating config for user: ${req.user._id}`);
    console.log(`[PUT /api/config] Request body:`, JSON.stringify(req.body, null, 2));

    // Validate that request body has valid fields
    const validSections = ['scanner', 'risk', 'reserve', 'playbook_A', 'playbook_B', 'playbook_C', 'playbook_D'];
    const providedSections = Object.keys(req.body);

    if (providedSections.length === 0) {
      console.log(`[PUT /api/config] No updates provided`);
      return res.status(400).json({
        error: 'No configuration updates provided'
      });
    }

    const invalidSections = providedSections.filter(section => !validSections.includes(section));
    if (invalidSections.length > 0) {
      console.log(`[PUT /api/config] Invalid sections provided: ${invalidSections.join(', ')}`);
      return res.status(400).json({
        error: `Invalid configuration sections: ${invalidSections.join(', ')}`
      });
    }

    // Update the config
    const config = await ConfigService.updateUserConfig(req.user._id, req.body);

    console.log(`[PUT /api/config] Config updated successfully for user: ${req.user._id}`);
    res.status(200).json({
      success: true,
      message: 'Configuration updated successfully',
      config
    });
  } catch (error) {
    const err = error as Error;
    console.error(`[PUT /api/config] Error updating config:`, err.message);
    console.error(err.stack);

    // Check if it's a validation error
    if (err.message.includes('must be between') || err.message.includes('Cannot update')) {
      return res.status(400).json({
        error: 'Invalid configuration values',
        message: err.message
      });
    }

    res.status(500).json({
      error: 'Failed to update configuration',
      message: err.message
    });
  }
});

export default router;
