import { Types } from 'mongoose';
import BotConfig from '../../models/BotConfig';
import Alert from '../../models/Alert';
import positionManager from './positionManager';
import Position from '../../models/Position';

export class KillSwitch {
  /**
   * Execute kill-switch: flatten positions and halt trading
   */
  async execute(
    userId: Types.ObjectId,
    haltType: 'DAILY' | 'WEEKLY',
    reason: string
  ): Promise<void> {
    try {
      console.log(`[KillSwitch] Executing ${haltType} kill-switch for user ${userId}: ${reason}`);

      // Get all open positions
      const openPositions = await Position.find({ userId, status: 'OPEN' });
      console.log(`[KillSwitch] Flattening ${openPositions.length} open positions`);

      // Close all positions
      const closePromises = openPositions.map(position =>
        positionManager.closePosition(position._id, 'KILL_SWITCH')
      );

      await Promise.all(closePromises);

      // Update bot config status
      const config = await BotConfig.findOne({ userId });
      if (!config) {
        throw new Error('Bot configuration not found');
      }

      config.botStatus = haltType === 'DAILY' ? 'HALTED_DAILY' : 'HALTED_WEEKLY';
      config.haltMetadata = {
        reason,
        timestamp: new Date(),
        positionsFlattened: openPositions.length,
        justification: `Automatic ${haltType.toLowerCase()} loss limit triggered`,
      };

      await config.save();

      // Create critical alert
      await Alert.create({
        userId,
        level: 'CRITICAL',
        type: haltType === 'DAILY' ? 'DAILY_LOSS_LIMIT' : 'WEEKLY_LOSS_LIMIT',
        message: `${haltType} loss limit reached. ${openPositions.length} positions flattened. Trading halted. ${reason}`,
        timestamp: new Date(),
      });

      console.log(`[KillSwitch] Kill-switch executed successfully - Bot status: ${config.botStatus}`);
    } catch (error) {
      console.error('[KillSwitch] Error executing kill-switch:', error);
      throw error;
    }
  }

  /**
   * Check if auto-resume is possible
   */
  async checkAutoResume(userId: Types.ObjectId): Promise<boolean> {
    try {
      const config = await BotConfig.findOne({ userId });
      if (!config) return false;

      // Only daily halts can auto-resume
      if (config.botStatus === 'HALTED_DAILY') {
        const now = new Date();
        const haltTime = config.haltMetadata?.timestamp;

        if (haltTime) {
          const haltDate = new Date(haltTime);
          const currentDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const haltDateOnly = new Date(haltDate.getFullYear(), haltDate.getMonth(), haltDate.getDate());

          // Auto-resume at next session (next day)
          if (currentDate > haltDateOnly) {
            console.log('[KillSwitch] Auto-resume triggered for daily halt');
            config.botStatus = 'ACTIVE';
            config.haltMetadata = {
              reason: 'Auto-resumed at new session',
              timestamp: now,
            };
            await config.save();

            await Alert.create({
              userId,
              level: 'INFO',
              type: 'TRADING_RESUMED',
              message: 'Trading auto-resumed at new session after daily halt',
              timestamp: now,
            });

            return true;
          }
        }
      }

      return false;
    } catch (error) {
      console.error('[KillSwitch] Error checking auto-resume:', error);
      return false;
    }
  }
}

export default new KillSwitch();
