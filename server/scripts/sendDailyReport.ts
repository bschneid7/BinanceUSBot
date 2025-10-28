import { Types } from 'mongoose';
import mongoose from 'mongoose';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const nodemailer = require('nodemailer');
import Position from '../models/Position';
import Trade from '../models/Trade';
import BotConfig from '../models/BotConfig';
import depositService from '../services/depositService';

/**
 * Standalone Daily Report Script
 * Can be run manually or via cron
 */

const USER_ID = new Types.ObjectId('68fac3bbd5f133b16fce5f47');

async function sendDailyReport() {
  try {
    console.log('[DailyReport] Connecting to database...');
    const mongoUri = process.env.MONGO_URI || 'mongodb://mongo:27017/binance_bot';
    await mongoose.connect(mongoUri);
    console.log('[DailyReport] Connected');

    // Get bot status
    console.log('[DailyReport] Fetching bot status...');
    const openPositions = await Position.find({ userId: USER_ID, status: 'OPEN' });
    const config = await BotConfig.findOne({ userId: USER_ID });
    
    const totalUnrealizedPnl = openPositions.reduce((sum, pos) => sum + (pos.unrealized_pnl || 0), 0);
    const startingCapital = await depositService.getNetDeposits(USER_ID);
    const allTrades = await Trade.find({ userId: USER_ID });
    const totalRealizedPnl = allTrades.reduce((sum, trade) => sum + (trade.pnl_usd || 0), 0);
    const equity = startingCapital + totalRealizedPnl + totalUnrealizedPnl;
    const totalPnl = totalRealizedPnl + totalUnrealizedPnl;
    const totalPnlPct = startingCapital > 0 ? (totalPnl / startingCapital) * 100 : 0;

    // Get daily P&L
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const dailyTrades = await Trade.find({ userId: USER_ID, date: { $gte: startOfDay } });
    const dailyPnl = dailyTrades.reduce((sum, trade) => sum + (trade.pnl_usd || 0), 0);

    // Get weekly P&L
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const weeklyTrades = await Trade.find({ userId: USER_ID, date: { $gte: startOfWeek } });
    const weeklyPnl = weeklyTrades.reduce((sum, trade) => sum + (trade.pnl_usd || 0), 0);

    const status = {
      status: config?.botStatus || 'ACTIVE',
      equity: Math.round(equity * 100) / 100,
      startingCapital: Math.round(startingCapital * 100) / 100,
      totalPnl: Math.round(totalPnl * 100) / 100,
      totalPnlPct: Math.round(totalPnlPct * 100) / 100,
      dailyPnl: Math.round(dailyPnl * 100) / 100,
      weeklyPnl: Math.round(weeklyPnl * 100) / 100,
      openPositions: openPositions.length,
      availableCapital: equity - openPositions.reduce((sum, pos) => sum + Math.abs(pos.position_size_usd || 0), 0),
      reserveLevel: 0,
      totalExposurePct: 0,
      totalOpenRiskR: 0,
      dailyPnlR: 0,
      weeklyPnlR: 0
    };

    // Sort positions by P&L
    const topPositions = openPositions.sort((a, b) => (b.unrealized_pnl || 0) - (a.unrealized_pnl || 0)).slice(0, 5);

    console.log('[DailyReport] Sending email...');
    
    // Generate email
    const subject = generateSubject(status);
    const html = generateHtmlReport(status, topPositions);

    // Send via SendGrid
    const transporter = nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      auth: {
        user: 'apikey',
        pass: process.env.SENDGRID_API_KEY,
      },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'bot@binance-trading.com',
      to: process.env.EMAIL_TO || 'bschneid7@gmail.com',
      subject,
      html,
    });

    console.log('[DailyReport] ✅ Email sent successfully!');
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('[DailyReport] ❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

function generateSubject(status: any): string {
  const date = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  const pnlEmoji = status.totalPnl >= 0 ? '📈' : '📉';
  const pnlSign = status.totalPnl >= 0 ? '+' : '';

  return `${pnlEmoji} Trading Bot Daily Report - ${date} | P&L: ${pnlSign}$${status.totalPnl.toFixed(2)} (${pnlSign}${status.totalPnlPct.toFixed(2)}%)`;
}

function generateHtmlReport(status: any, positions: any[]): string {
  const date = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  const pnlColor = status.totalPnl >= 0 ? '#10b981' : '#ef4444';
  const dailyPnlColor = status.dailyPnl >= 0 ? '#10b981' : '#ef4444';
  const weeklyPnlColor = status.weeklyPnl >= 0 ? '#10b981' : '#ef4444';

  const statusBadgeColor = {
    'ACTIVE': '#10b981',
    'HALTED_DAILY': '#f59e0b',
    'HALTED_WEEKLY': '#ef4444',
    'STOPPED': '#6b7280'
  }[status.status] || '#6b7280';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Daily Trading Report</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">📊 Daily Trading Report</h1>
              <p style="margin: 5px 0 0 0; color: #e0e7ff; font-size: 14px;">${date}</p>
            </td>
          </tr>

          <!-- Bot Status -->
          <tr>
            <td style="padding: 20px 30px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <h2 style="margin: 0 0 15px 0; font-size: 18px; color: #1f2937;">Bot Status</h2>
                  </td>
                  <td align="right">
                    <span style="background-color: ${statusBadgeColor}; color: #ffffff; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600;">${status.status}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Key Metrics -->
          <tr>
            <td style="padding: 0 30px 20px 30px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 6px; padding: 15px;">
                <tr>
                  <td width="50%" style="padding: 10px;">
                    <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Current Equity</div>
                    <div style="font-size: 24px; font-weight: 700; color: #1f2937;">$${status.equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  </td>
                  <td width="50%" style="padding: 10px; text-align: right;">
                    <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Starting Capital</div>
                    <div style="font-size: 24px; font-weight: 700; color: #1f2937;">$${status.startingCapital.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Total P&L -->
          <tr>
            <td style="padding: 0 30px 20px 30px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, ${pnlColor}15 0%, ${pnlColor}05 100%); border-radius: 6px; padding: 20px; border: 2px solid ${pnlColor};">
                <tr>
                  <td>
                    <div style="font-size: 14px; color: #6b7280; margin-bottom: 8px;">Total P&L (All-Time)</div>
                    <div style="font-size: 32px; font-weight: 700; color: ${pnlColor};">
                      ${status.totalPnl >= 0 ? '+' : ''}$${status.totalPnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div style="font-size: 18px; font-weight: 600; color: ${pnlColor}; margin-top: 4px;">
                      ${status.totalPnl >= 0 ? '+' : ''}${status.totalPnlPct.toFixed(2)}%
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Daily & Weekly P&L -->
          <tr>
            <td style="padding: 0 30px 20px 30px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="48%" style="background-color: #f9fafb; border-radius: 6px; padding: 15px;">
                    <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Daily P&L</div>
                    <div style="font-size: 20px; font-weight: 700; color: ${dailyPnlColor};">
                      ${status.dailyPnl >= 0 ? '+' : ''}$${status.dailyPnl.toFixed(2)}
                    </div>
                  </td>
                  <td width="4%"></td>
                  <td width="48%" style="background-color: #f9fafb; border-radius: 6px; padding: 15px;">
                    <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Weekly P&L</div>
                    <div style="font-size: 20px; font-weight: 700; color: ${weeklyPnlColor};">
                      ${status.weeklyPnl >= 0 ? '+' : ''}$${status.weeklyPnl.toFixed(2)}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Open Positions -->
          <tr>
            <td style="padding: 0 30px 20px 30px;">
              <h3 style="margin: 0 0 15px 0; font-size: 16px; color: #1f2937;">Open Positions: ${status.openPositions}</h3>
              ${positions.length > 0 ? `
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
                <thead>
                  <tr style="background-color: #f9fafb;">
                    <th style="padding: 10px; text-align: left; font-size: 12px; font-weight: 600; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Symbol</th>
                    <th style="padding: 10px; text-align: right; font-size: 12px; font-weight: 600; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Side</th>
                    <th style="padding: 10px; text-align: right; font-size: 12px; font-weight: 600; color: #6b7280; border-bottom: 1px solid #e5e7eb;">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  ${positions.map(pos => {
                    const posColor = (pos.unrealized_pnl || 0) >= 0 ? '#10b981' : '#ef4444';
                    return `
                    <tr>
                      <td style="padding: 10px; font-size: 13px; font-weight: 600; color: #1f2937; border-bottom: 1px solid #f3f4f6;">${pos.symbol}</td>
                      <td style="padding: 10px; text-align: right; font-size: 13px; color: #6b7280; border-bottom: 1px solid #f3f4f6;">${pos.side}</td>
                      <td style="padding: 10px; text-align: right; font-size: 13px; font-weight: 600; color: ${posColor}; border-bottom: 1px solid #f3f4f6;">
                        ${(pos.unrealized_pnl || 0) >= 0 ? '+' : ''}$${(pos.unrealized_pnl || 0).toFixed(2)}
                      </td>
                    </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
              ` : '<p style="color: #6b7280;">No open positions</p>'}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 30px; background-color: #f9fafb; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #6b7280;">
                This is an automated daily report from your Binance US Trading Bot.
              </p>
              <p style="margin: 8px 0 0 0; font-size: 12px; color: #9ca3af;">
                Report generated at ${new Date().toLocaleString('en-US')}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

sendDailyReport();

