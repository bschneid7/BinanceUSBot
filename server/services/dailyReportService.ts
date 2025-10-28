import { Types } from 'mongoose';
import botStatusService from './botStatusService';
import Position from '../models/Position';
import emailService from './emailService';

/**
 * Daily Report Service
 * Generates and sends daily P&L reports
 */
class DailyReportService {
  /**
   * Generate and send daily P&L report
   */
  async sendDailyReport(userId: Types.ObjectId): Promise<void> {
    try {
      console.log('[DailyReport] Generating daily P&L report...');

      // Get bot status
      const status = await botStatusService.getBotStatus(userId);

      // Get top positions by P&L
      const positions = await Position.find({ userId, status: 'OPEN' })
        .sort({ unrealized_pnl: -1 })
        .limit(10);

      // Generate HTML email
      const html = this.generateHtmlReport(status, positions);
      const subject = this.generateSubject(status);

      // Send email
      const sent = await emailService.sendEmail(subject, html);

      if (sent) {
        console.log('[DailyReport] Daily report sent successfully');
      } else {
        console.log('[DailyReport] Daily report not sent (email disabled or failed)');
      }
    } catch (error) {
      console.error('[DailyReport] Error generating daily report:', error);
    }
  }

  /**
   * Generate email subject line
   */
  private generateSubject(status: any): string {
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

  /**
   * Generate HTML email body
   */
  private generateHtmlReport(status: any, positions: any[]): string {
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
                    <div style="font-size: 14px; color: #6b7280; margin-top: 2px;">
                      ${status.dailyPnlR >= 0 ? '+' : ''}${status.dailyPnlR.toFixed(2)}R
                    </div>
                  </td>
                  <td width="4%"></td>
                  <td width="48%" style="background-color: #f9fafb; border-radius: 6px; padding: 15px;">
                    <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Weekly P&L</div>
                    <div style="font-size: 20px; font-weight: 700; color: ${weeklyPnlColor};">
                      ${status.weeklyPnl >= 0 ? '+' : ''}$${status.weeklyPnl.toFixed(2)}
                    </div>
                    <div style="font-size: 14px; color: #6b7280; margin-top: 2px;">
                      ${status.weeklyPnlR >= 0 ? '+' : ''}${status.weeklyPnlR.toFixed(2)}R
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Portfolio Metrics -->
          <tr>
            <td style="padding: 0 30px 20px 30px;">
              <h3 style="margin: 0 0 15px 0; font-size: 16px; color: #1f2937;">Portfolio Metrics</h3>
              <table width="100%" cellpadding="8" cellspacing="0" style="background-color: #f9fafb; border-radius: 6px;">
                <tr>
                  <td style="font-size: 13px; color: #6b7280;">Open Positions</td>
                  <td align="right" style="font-size: 14px; font-weight: 600; color: #1f2937;">${status.openPositions}</td>
                </tr>
                <tr>
                  <td style="font-size: 13px; color: #6b7280;">Available Capital</td>
                  <td align="right" style="font-size: 14px; font-weight: 600; color: #1f2937;">$${status.availableCapital.toFixed(2)}</td>
                </tr>
                <tr>
                  <td style="font-size: 13px; color: #6b7280;">Reserve Level</td>
                  <td align="right" style="font-size: 14px; font-weight: 600; color: #1f2937;">${status.reserveLevel.toFixed(1)}%</td>
                </tr>
                <tr>
                  <td style="font-size: 13px; color: #6b7280;">Total Exposure</td>
                  <td align="right" style="font-size: 14px; font-weight: 600; color: #1f2937;">${status.totalExposurePct.toFixed(1)}%</td>
                </tr>
                <tr>
                  <td style="font-size: 13px; color: #6b7280;">Total Risk (R)</td>
                  <td align="right" style="font-size: 14px; font-weight: 600; color: #1f2937;">${status.totalOpenRiskR.toFixed(2)}R</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Top Positions -->
          ${positions.length > 0 ? `
          <tr>
            <td style="padding: 0 30px 20px 30px;">
              <h3 style="margin: 0 0 15px 0; font-size: 16px; color: #1f2937;">Top Positions by P&L</h3>
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
                <thead>
                  <tr style="background-color: #f9fafb;">
                    <th style="padding: 10px; text-align: left; font-size: 12px; font-weight: 600; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Symbol</th>
                    <th style="padding: 10px; text-align: right; font-size: 12px; font-weight: 600; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Side</th>
                    <th style="padding: 10px; text-align: right; font-size: 12px; font-weight: 600; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Size</th>
                    <th style="padding: 10px; text-align: right; font-size: 12px; font-weight: 600; color: #6b7280; border-bottom: 1px solid #e5e7eb;">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  ${positions.slice(0, 5).map(pos => {
                    const posColor = (pos.unrealized_pnl || 0) >= 0 ? '#10b981' : '#ef4444';
                    return `
                    <tr>
                      <td style="padding: 10px; font-size: 13px; font-weight: 600; color: #1f2937; border-bottom: 1px solid #f3f4f6;">${pos.symbol}</td>
                      <td style="padding: 10px; text-align: right; font-size: 13px; color: #6b7280; border-bottom: 1px solid #f3f4f6;">${pos.side}</td>
                      <td style="padding: 10px; text-align: right; font-size: 13px; color: #6b7280; border-bottom: 1px solid #f3f4f6;">$${Math.abs(pos.position_size_usd || 0).toFixed(0)}</td>
                      <td style="padding: 10px; text-align: right; font-size: 13px; font-weight: 600; color: ${posColor}; border-bottom: 1px solid #f3f4f6;">
                        ${(pos.unrealized_pnl || 0) >= 0 ? '+' : ''}$${(pos.unrealized_pnl || 0).toFixed(2)}
                      </td>
                    </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </td>
          </tr>
          ` : ''}

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
}

export default new DailyReportService();

