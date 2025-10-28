import cron from 'node-cron';
import BotState from '../models/BotState';
import snapshotService from '../services/snapshotService';

/**
 * Daily Equity Snapshot Cron Job
 * Runs at midnight UTC every day to create equity snapshot
 */
export function initializeSnapshotCron() {
  // Run at midnight UTC every day
  cron.schedule('0 0 * * *', async () => {
    try {
      console.log('[SnapshotCron] Running daily snapshot job...');
      
      const botState = await BotState.findOne();
      if (!botState) {
        console.error('[SnapshotCron] Bot state not found');
        return;
      }

      await snapshotService.createSnapshot(botState.userId);
      
      console.log('[SnapshotCron] ✅ Daily snapshot created successfully');
    } catch (error) {
      console.error('[SnapshotCron] ❌ Error creating daily snapshot:', error);
    }
  });

  console.log('[SnapshotCron] Daily snapshot cron job initialized (runs at midnight UTC)');
}

