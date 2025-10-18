import dotenv from 'dotenv';
import crypto from 'crypto';
import { connectDB } from '../config/database';
import TaxReport from '../models/TaxReport';
import User from '../models/User';

// Load environment variables
dotenv.config();

/**
 * Generate a content hash for a tax report
 */
const generateContentHash = (data: unknown): string => {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(data))
    .digest('hex')
    .substring(0, 16);
};

/**
 * Seed tax reports for testing
 */
async function seedTaxReports() {
  try {
    console.log('[SeedTaxReports] Starting tax reports seeding...');

    // Connect to database
    await connectDB();

    // Get the first user
    const user = await User.findOne();
    if (!user) {
      console.error('[SeedTaxReports] No users found. Please create a user first.');
      process.exit(1);
    }

    console.log(`[SeedTaxReports] Found user: ${user.email}`);

    // Clear existing tax reports for this user
    await TaxReport.deleteMany({ userId: user._id });
    console.log('[SeedTaxReports] Cleared existing tax reports');

    // Generate tax reports for the past 6 months
    const reports = [];
    const currentDate = new Date();

    for (let i = 5; i >= 0; i--) {
      const reportDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const month = `${reportDate.getFullYear()}-${String(reportDate.getMonth() + 1).padStart(2, '0')}`;

      // Generate realistic data
      const equity = 7000 + (Math.random() * 1000 - 500);
      const realizedPnl = Math.random() * 400 - 200;
      const feesPaid = Math.abs(realizedPnl) * 0.002 + Math.random() * 20;

      const balances = {
        BTC: parseFloat((Math.random() * 0.1 + 0.05).toFixed(6)),
        ETH: parseFloat((Math.random() * 2 + 1).toFixed(4)),
        SOL: parseFloat((Math.random() * 50 + 20).toFixed(2)),
        USDT: parseFloat((equity * (0.2 + Math.random() * 0.2)).toFixed(2))
      };

      const reportData = {
        month,
        equity: parseFloat(equity.toFixed(2)),
        realizedPnl: parseFloat(realizedPnl.toFixed(2)),
        feesPaid: parseFloat(feesPaid.toFixed(2)),
        balances
      };

      const contentHash = generateContentHash(reportData);

      // Determine status based on month
      let reconciliationStatus: 'pending' | 'balanced' | 'discrepancy';
      if (i === 0) {
        reconciliationStatus = 'pending'; // Current month
      } else if (Math.random() > 0.9) {
        reconciliationStatus = 'discrepancy'; // 10% chance
      } else {
        reconciliationStatus = 'balanced';
      }

      reports.push({
        userId: user._id,
        month,
        createdAt: new Date(reportDate.getFullYear(), reportDate.getMonth() + 1, 1), // First day of next month
        equity: reportData.equity,
        realizedPnl: reportData.realizedPnl,
        feesPaid: reportData.feesPaid,
        balances: reportData.balances,
        contentHash,
        frozen: i > 0, // Freeze all except current month
        pdfUrl: i > 0 ? `/tax_documents/${month}-Reconciliation.pdf` : undefined,
        reconciliationStatus,
        notes: reconciliationStatus === 'discrepancy' ? 'Minor rounding difference detected ($2.50)' : undefined
      });
    }

    // Insert tax reports
    await TaxReport.insertMany(reports);

    console.log(`[SeedTaxReports] Successfully seeded ${reports.length} tax reports`);

    // Display summary
    console.log('\n[SeedTaxReports] Summary:');
    reports.forEach(report => {
      console.log(`  ${report.month}: Equity=$${report.equity.toFixed(2)}, PnL=$${report.realizedPnl.toFixed(2)}, Status=${report.reconciliationStatus}, Frozen=${report.frozen}`);
    });

    console.log('\n[SeedTaxReports] Tax reports seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('[SeedTaxReports] Error seeding tax reports:', error);
    process.exit(1);
  }
}

// Run the seed function
seedTaxReports();
