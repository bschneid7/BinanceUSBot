/**
 * Alert Service
 * Handles sending alerts via multiple channels (console, email, webhook)
 */

interface AlertOptions {
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  data?: Record<string, any>;
}

class AlertService {
  /**
   * Send alert to all configured channels
   */
  async sendAlert(options: AlertOptions): Promise<void> {
    const { severity, title, message, data } = options;
    
    // Always log to console
    const logPrefix = severity === 'critical' ? '🚨' : severity === 'warning' ? '⚠️' : 'ℹ️';
    console.log(`${logPrefix} [Alert] ${title}`);
    console.log(`  ${message}`);
    if (data) {
      console.log('  Data:', JSON.stringify(data, null, 2));
    }

    // Send email if configured
    if (process.env.ALERT_EMAIL_ENABLED === 'true') {
      await this.sendEmail(options);
    }

    // Send webhook if configured (Slack, Discord, etc.)
    if (process.env.ALERT_WEBHOOK_URL) {
      await this.sendWebhook(options);
    }

    // Send SMS if configured (Twilio, etc.)
    if (process.env.ALERT_SMS_ENABLED === 'true') {
      await this.sendSMS(options);
    }
  }

  /**
   * Send email alert
   */
  private async sendEmail(options: AlertOptions): Promise<void> {
    try {
      // TODO: Implement email sending using nodemailer or SendGrid
      console.log('[Alert] Email alert would be sent:', options.title);
      
      // Example implementation:
      // const transporter = nodemailer.createTransporter({...});
      // await transporter.sendMail({
      //   from: process.env.ALERT_EMAIL_FROM,
      //   to: process.env.ALERT_EMAIL_TO,
      //   subject: `[${options.severity.toUpperCase()}] ${options.title}`,
      //   text: options.message,
      //   html: this.formatEmailHTML(options)
      // });
    } catch (error) {
      console.error('[Alert] Failed to send email:', error);
    }
  }

  /**
   * Send webhook alert (Slack, Discord, etc.)
   */
  private async sendWebhook(options: AlertOptions): Promise<void> {
    try {
      const webhookUrl = process.env.ALERT_WEBHOOK_URL;
      if (!webhookUrl) return;

      const payload = {
        text: `${options.title}\n${options.message}`,
        severity: options.severity,
        data: options.data,
        timestamp: new Date().toISOString()
      };

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        console.error('[Alert] Webhook failed:', response.statusText);
      }
    } catch (error) {
      console.error('[Alert] Failed to send webhook:', error);
    }
  }

  /**
   * Send SMS alert
   */
  private async sendSMS(options: AlertOptions): Promise<void> {
    try {
      // TODO: Implement SMS sending using Twilio or similar
      console.log('[Alert] SMS alert would be sent:', options.title);
      
      // Example implementation:
      // const twilio = require('twilio')(
      //   process.env.TWILIO_ACCOUNT_SID,
      //   process.env.TWILIO_AUTH_TOKEN
      // );
      // await twilio.messages.create({
      //   body: `[${options.severity.toUpperCase()}] ${options.title}: ${options.message}`,
      //   from: process.env.TWILIO_PHONE_NUMBER,
      //   to: process.env.ALERT_PHONE_NUMBER
      // });
    } catch (error) {
      console.error('[Alert] Failed to send SMS:', error);
    }
  }

  /**
   * Convenience methods for different severity levels
   */
  async info(title: string, message: string, data?: Record<string, any>): Promise<void> {
    await this.sendAlert({ severity: 'info', title, message, data });
  }

  async warning(title: string, message: string, data?: Record<string, any>): Promise<void> {
    await this.sendAlert({ severity: 'warning', title, message, data });
  }

  async critical(title: string, message: string, data?: Record<string, any>): Promise<void> {
    await this.sendAlert({ severity: 'critical', title, message, data });
  }
}

export default new AlertService();

