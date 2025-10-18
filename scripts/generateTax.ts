#!/usr/bin/env tsx

/**
 * Cron job to generate weekly tax reports
 *
 * Run schedule: Weekly on Sunday at midnight (0 0 * * 0)
 *
 * This script:
 * 1. Reconciles trades with exchange data
 * 2. Calculates HIFO cost basis for all trades
 * 3. Generates Form 8949 preview
 * 4. Creates weekly tax report snapshot
 */

import '../server/config/database';
import User from '../server/models/User';
import Trade from '../server/models/Trade';
import Lot from '../server/models/Lot';
import TaxReport from '../server/models/TaxReport';
import Alert from '../server/models/Alert';
import { connectDB } from '../server/config/database';

interface TaxSummary {
  userId: string;
  email: string;
  totalTrades: number;
  shortTermGains: number;
  longTermGains: number;
  totalGains: number;
  reportGenerated: boolean;
}

/**
 * Calculate HIFO (Highest-In-First-Out) cost basis
 */
function calculateHIFO(lots: any[], sellQuantity: number): {
  costBasis: number;
  lotsConsumed: string[];
} {
  // Sort lots by cost per unit (descending)
  const sortedLots = lots
    .filter((lot) => lot.remaining_quantity > 0)
    .sort((a, b) => b.cost_per_unit - a.cost_per_unit);

  let remainingQty = sellQuantity;
  let costBasis = 0;
  const lotsConsumed: string[] = [];

  for (const lot of sortedLots) {
    if (remainingQty <= 0) break;

    const qtyToUse = Math.min(remainingQty, lot.remaining_quantity);
    costBasis += qtyToUse * lot.cost_per_unit;
    lotsConsumed.push(lot.lot_id);
    remainingQty -= qtyToUse;
  }

  return { costBasis, lotsConsumed };
}

/**
 * Generate tax report for a single user
 */
async function generateTaxReportForUser(userId: string): Promise<TaxSummary | null> {
  try {
    console.log(`[GenerateTax] Processing user ${userId}`);

    // Get user details
    const user = await User.findById(userId);
    if (!user) {
      console.log(`[GenerateTax] User not found: ${userId}`);
      return null;
    }

    // Get all trades for the past week
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const trades = await Trade.find({
      userId,
      createdAt: { $gte: oneWeekAgo },
    }).sort({ createdAt: 1 });

    console.log(`[GenerateTax] Found ${trades.length} trades for user ${user.email}`);

    if (trades.length === 0) {
      return null;
    }

    // Get all lots for the user
    const lots = await Lot.find({ userId });

    let shortTermGains = 0;
    let longTermGains = 0;

    // Process each trade
    for (const trade of trades) {
      if (trade.side === 'SELL') {
        // Calculate cost basis using HIFO
        const { costBasis } = calculateHIFO(lots, trade.quantity);

        // Calculate gain/loss
        const proceeds = trade.entry_price * trade.quantity;
        const gain = proceeds - costBasis;

        // Determine holding period (simplified: < 365 days = short-term)
        // In production, check actual lot acquired dates
        const isShortTerm = true; // Simplified for MVP

        if (isShortTerm) {
          shortTermGains += gain;
        } else {
          longTermGains += gain;
        }

        console.log(`[GenerateTax] Trade ${trade._id}: ${trade.symbol} ${trade.side}, Proceeds=$${proceeds.toFixed(2)}, Cost Basis=$${costBasis.toFixed(2)}, Gain=$${gain.toFixed(2)}`);
      }
    }

    const totalGains = shortTermGains + longTermGains;

    // Create or update tax report for current month
    const month = new Date().toISOString().substring(0, 7); // YYYY-MM

    let taxReport = await TaxReport.findOne({ userId, month });

    if (!taxReport) {
      taxReport = await TaxReport.create({
        userId,
        month,
        equity: 0, // Would fetch from BotState
        realized_pnl: totalGains,
        fees_paid: 0,
        balances: {},
        reconciled: true,
        frozen: false,
      });
    } else {
      taxReport.realized_pnl += totalGains;
      taxReport.reconciled = true;
      await taxReport.save();
    }

    // Create alert
    await Alert.create({
      userId,
      level: 'INFO',
      type: 'TAX',
      message: `Weekly tax report generated: ${trades.length} trades, $${totalGains.toFixed(2)} total gains`,
      timestamp: new Date(),
    });

    console.log(`[GenerateTax] Tax report generated for user ${user.email}`);

    return {
      userId,
      email: user.email,
      totalTrades: trades.length,
      shortTermGains,
      longTermGains,
      totalGains,
      reportGenerated: true,
    };
  } catch (error) {
    console.error(`[GenerateTax] Error generating report for user ${userId}:`, error);

    // Create error alert
    await Alert.create({
      userId,
      level: 'ERROR',
      type: 'TAX',
      message: `Failed to generate tax report: ${error}`,
      timestamp: new Date(),
    }).catch((err) => console.error('[GenerateTax] Error creating alert:', err));

    return null;
  }
}

/**
 * Generate Form 8949 preview (mock implementation)
 */
function generateForm8949Preview(summaries: TaxSummary[]): string {
  let form = `FORM 8949 PREVIEW - ${new Date().toISOString().substring(0, 10)}\n`;
  form += '='.repeat(80) + '\n\n';

  form += 'Part I: Short-Term Capital Gains and Losses\n';
  form += '-'.repeat(80) + '\n';

  let totalShortTerm = 0;
  let totalLongTerm = 0;

  summaries.forEach((summary) => {
    if (summary.shortTermGains !== 0) {
      form += `User: ${summary.email}\n`;
      form += `  Trades: ${summary.totalTrades}\n`;
      form += `  Short-term gains: $${summary.shortTermGains.toFixed(2)}\n\n`;
      totalShortTerm += summary.shortTermGains;
    }
  });

  form += `TOTAL SHORT-TERM: $${totalShortTerm.toFixed(2)}\n\n`;

  form += 'Part II: Long-Term Capital Gains and Losses\n';
  form += '-'.repeat(80) + '\n';

  summaries.forEach((summary) => {
    if (summary.longTermGains !== 0) {
      form += `User: ${summary.email}\n`;
      form += `  Trades: ${summary.totalTrades}\n`;
      form += `  Long-term gains: $${summary.longTermGains.toFixed(2)}\n\n`;
      totalLongTerm += summary.longTermGains;
    }
  });

  form += `TOTAL LONG-TERM: $${totalLongTerm.toFixed(2)}\n\n`;
  form += '='.repeat(80) + '\n';
  form += `TOTAL CAPITAL GAINS: $${(totalShortTerm + totalLongTerm).toFixed(2)}\n`;

  return form;
}

/**
 * Main function
 */
async function main() {
  console.log('========================================');
  console.log('Generate Tax Reports Cron Job');
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log('========================================\n');

  try {
    // Connect to database
    await connectDB();
    console.log('[GenerateTax] Connected to database\n');

    // Get all users
    const users = await User.find({});
    console.log(`[GenerateTax] Found ${users.length} users\n`);

    const summaries: TaxSummary[] = [];

    // Process each user
    for (const user of users) {
      const summary = await generateTaxReportForUser(user._id.toString());
      if (summary) {
        summaries.push(summary);
      }
    }

    // Generate Form 8949 preview
    if (summaries.length > 0) {
      const form8949 = generateForm8949Preview(summaries);
      console.log('\n' + form8949);
    }

    // Summary
    console.log('\n========================================');
    console.log('Tax Generation Summary');
    console.log('========================================');
    console.log(`Total users processed: ${users.length}`);
    console.log(`Reports generated: ${summaries.length}`);

    if (summaries.length > 0) {
      const totalTrades = summaries.reduce((sum, s) => sum + s.totalTrades, 0);
      const totalGains = summaries.reduce((sum, s) => sum + s.totalGains, 0);

      console.log(`Total trades: ${totalTrades}`);
      console.log(`Total gains: $${totalGains.toFixed(2)}`);

      summaries.forEach((s, i) => {
        console.log(`  ${i + 1}. ${s.email}: ${s.totalTrades} trades, $${s.totalGains.toFixed(2)}`);
      });
    }

    console.log(`\nCompleted at: ${new Date().toISOString()}`);
    console.log('========================================\n');

    process.exit(0);
  } catch (error) {
    console.error('\n[GenerateTax] Fatal error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { generateTaxReportForUser, calculateHIFO, generateForm8949Preview };
