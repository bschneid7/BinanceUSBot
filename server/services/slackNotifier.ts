/**
 * Slack Notification Service
 * Sends real-time alerts to Slack channel
 */

import axios from 'axios';

interface SlackAttachment {
  color?: string;
  title?: string;
  text?: string;
  fields?: Array<{
    title: string;
    value: string;
    short?: boolean;
  }>;
  footer?: string;
  ts?: number;
}

interface SlackMessage {
  text?: string;
  attachments?: SlackAttachment[];
  username?: string;
  icon_emoji?: string;
}

export class SlackNotifier {
  private webhookUrl: string;
  private enabled: boolean;

  constructor() {
    this.webhookUrl = process.env.SLACK_WEBHOOK_URL || '';
    this.enabled = !!this.webhookUrl;

    if (this.enabled) {
      console.log('[SlackNotifier] Initialized and enabled');
    } else {
      console.log('[SlackNotifier] Disabled (no webhook URL configured)');
    }
  }

  /**
   * Send a message to Slack
   */
  private async send(message: SlackMessage): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      await axios.post(this.webhookUrl, message, {
        headers: {
          'Content-Type': 'application/json',
        },
      });
    } catch (error) {
      console.error('[SlackNotifier] Error sending message:', error);
    }
  }

  /**
   * Send signal generation alert
   */
  async notifySignalGenerated(
    symbol: string,
    side: 'BUY' | 'SELL',
    strategy: string,
    confidence: number,
    price: number
  ): Promise<void> {
    await this.send({
      text: `📊 *New Signal Generated*`,
      attachments: [
        {
          color: side === 'BUY' ? 'good' : 'danger',
          fields: [
            { title: 'Symbol', value: symbol, short: true },
            { title: 'Side', value: side, short: true },
            { title: 'Strategy', value: strategy, short: true },
            { title: 'Confidence', value: `${(confidence * 100).toFixed(1)}%`, short: true },
            { title: 'Price', value: `$${price.toFixed(2)}`, short: true },
          ],
          footer: 'BinanceUSBot',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    });
  }

  /**
   * Send order execution alert
   */
  async notifyOrderPlaced(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    price: number,
    orderId: string
  ): Promise<void> {
    await this.send({
      text: `💰 *Order Placed*`,
      attachments: [
        {
          color: side === 'BUY' ? '#36a64f' : '#ff0000',
          fields: [
            { title: 'Symbol', value: symbol, short: true },
            { title: 'Side', value: side, short: true },
            { title: 'Quantity', value: quantity.toFixed(6), short: true },
            { title: 'Price', value: `$${price.toFixed(2)}`, short: true },
            { title: 'Order ID', value: orderId, short: false },
          ],
          footer: 'BinanceUSBot',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    });
  }

  /**
   * Send order fill alert
   */
  async notifyOrderFilled(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    price: number,
    pnl?: number,
    pnlPercent?: number
  ): Promise<void> {
    const fields: Array<{ title: string; value: string; short?: boolean }> = [
      { title: 'Symbol', value: symbol, short: true },
      { title: 'Side', value: side, short: true },
      { title: 'Quantity', value: quantity.toFixed(6), short: true },
      { title: 'Price', value: `$${price.toFixed(2)}`, short: true },
    ];

    if (pnl !== undefined && pnlPercent !== undefined) {
      const pnlColor = pnl >= 0 ? '🟢' : '🔴';
      fields.push({
        title: 'P&L',
        value: `${pnlColor} $${pnl.toFixed(2)} (${pnlPercent.toFixed(2)}%)`,
        short: false,
      });
    }

    await this.send({
      text: `✅ *Order Filled*`,
      attachments: [
        {
          color: pnl && pnl >= 0 ? 'good' : 'danger',
          fields,
          footer: 'BinanceUSBot',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    });
  }

  /**
   * Send warning alert
   */
  async notifyWarning(title: string, message: string, details?: Record<string, any>): Promise<void> {
    const fields: Array<{ title: string; value: string; short?: boolean }> = [
      { title: 'Message', value: message, short: false },
    ];

    if (details) {
      Object.entries(details).forEach(([key, value]) => {
        fields.push({
          title: key,
          value: String(value),
          short: true,
        });
      });
    }

    await this.send({
      text: `⚠️ *${title}*`,
      attachments: [
        {
          color: 'warning',
          fields,
          footer: 'BinanceUSBot',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    });
  }

  /**
   * Send error alert
   */
  async notifyError(title: string, error: string, details?: Record<string, any>): Promise<void> {
    const fields: Array<{ title: string; value: string; short?: boolean }> = [
      { title: 'Error', value: error, short: false },
    ];

    if (details) {
      Object.entries(details).forEach(([key, value]) => {
        fields.push({
          title: key,
          value: String(value),
          short: true,
        });
      });
    }

    await this.send({
      text: `🛑 *${title}*`,
      attachments: [
        {
          color: 'danger',
          fields,
          footer: 'BinanceUSBot',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    });
  }

  /**
   * Send kill-switch activation alert
   */
  async notifyKillSwitch(
    type: 'daily' | 'weekly',
    currentLoss: number,
    threshold: number,
    equity: number
  ): Promise<void> {
    await this.send({
      text: `🚨 *KILL-SWITCH ACTIVATED*`,
      attachments: [
        {
          color: 'danger',
          fields: [
            { title: 'Type', value: type.toUpperCase(), short: true },
            { title: 'Current Loss', value: `$${currentLoss.toFixed(2)}`, short: true },
            { title: 'Threshold', value: `$${threshold.toFixed(2)}`, short: true },
            { title: 'Equity', value: `$${equity.toFixed(2)}`, short: true },
          ],
          text: '⚠️ Trading has been halted to prevent further losses.',
          footer: 'BinanceUSBot',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    });
  }

  /**
   * Send daily summary
   */
  async notifyDailySummary(
    date: string,
    pnl: number,
    pnlPercent: number,
    trades: number,
    winRate: number,
    equity: number
  ): Promise<void> {
    const pnlEmoji = pnl >= 0 ? '🟢' : '🔴';
    const pnlColor = pnl >= 0 ? 'good' : 'danger';

    await this.send({
      text: `📈 *Daily Summary - ${date}*`,
      attachments: [
        {
          color: pnlColor,
          fields: [
            { title: 'P&L', value: `${pnlEmoji} $${pnl.toFixed(2)} (${pnlPercent.toFixed(2)}%)`, short: false },
            { title: 'Trades', value: String(trades), short: true },
            { title: 'Win Rate', value: `${winRate.toFixed(1)}%`, short: true },
            { title: 'Equity', value: `$${equity.toFixed(2)}`, short: false },
          ],
          footer: 'BinanceUSBot',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    });
  }

  /**
   * Send bot startup notification
   */
  async notifyStartup(version: string, equity: number): Promise<void> {
    await this.send({
      text: `🚀 *Bot Started*`,
      attachments: [
        {
          color: 'good',
          fields: [
            { title: 'Version', value: version, short: true },
            { title: 'Equity', value: `$${equity.toFixed(2)}`, short: true },
            { title: 'Status', value: 'Operational', short: false },
          ],
          footer: 'BinanceUSBot',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    });
  }

  /**
   * Send bot shutdown notification
   */
  async notifyShutdown(reason: string): Promise<void> {
    await this.send({
      text: `⏸️ *Bot Stopped*`,
      attachments: [
        {
          color: 'warning',
          fields: [
            { title: 'Reason', value: reason, short: false },
          ],
          footer: 'BinanceUSBot',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    });
  }

  /**
   * Send test notification
   */
  async sendTestNotification(): Promise<void> {
    await this.send({
      text: `✅ *Slack Integration Test*`,
      attachments: [
        {
          color: 'good',
          text: 'If you see this message, Slack notifications are working correctly!',
          footer: 'BinanceUSBot',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    });
  }
}

// Export singleton instance
export const slackNotifier = new SlackNotifier();
