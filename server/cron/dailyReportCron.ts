import cron from 'node-cron';
import { Types } from 'mongoose';
import dailyReportService from '../services/dailyReportService';

/**
 * Daily Report Cron Job
 * Sends daily P&L reports at specified time
 */

// User ID (update this with actual user ID)
const USER_ID = new Types.ObjectId('68fac3bbd5f133b16fce5f47');

// Schedule: Every day at 6:00 PM EST (23:00 UTC)
// Cron format: seconds minutes hours day month dayOfWeek
const SCHEDULE = '0 0 23 * * *'; // 11:00 PM UTC = 6:00 PM EST

// Alternative schedules (uncomment to use):
// const SCHEDULE = '0 0 9 * * *';   // 9:00 AM UTC = 4:00 AM EST
// const SCHEDULE = '0 0 12 * * *';  // 12:00 PM UTC = 7:00 AM EST
// const SCHEDULE = '0 0 18 * * *';  // 6:00 PM UTC = 1:00 PM EST

export function initializeDailyReportCron() {
  // Validate cron expression
  if (!cron.validate(SCHEDULE)) {
    console.error('[DailyReportCron] Invalid cron schedule:', SCHEDULE);
    return;
  }

  // Schedule the job
  const job = cron.schedule(SCHEDULE, async () => {
    try {
      console.log('[DailyReportCron] Running daily report job...');
      await dailyReportService.sendDailyReport(USER_ID);
      console.log('[DailyReportCron] Daily report job completed');
    } catch (error) {
      console.error('[DailyReportCron] Error in daily report job:', error);
    }
  }, {
    timezone: 'UTC'
  });

  console.log(`[DailyReportCron] Daily report cron job initialized (schedule: ${SCHEDULE} UTC)`);
  console.log('[DailyReportCron] Reports will be sent daily at 6:00 PM EST (11:00 PM UTC)');

  return job;
}

// Manual trigger function for testing
export async function triggerDailyReportNow() {
  console.log('[DailyReportCron] Manually triggering daily report...');
  try {
    await dailyReportService.sendDailyReport(USER_ID);
    console.log('[DailyReportCron] Manual report sent successfully');
  } catch (error) {
    console.error('[DailyReportCron] Error sending manual report:', error);
  }
}

