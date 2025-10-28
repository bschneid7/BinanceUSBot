import nodemailer from 'nodemailer';

/**
 * Email Service
 * Handles sending emails via SMTP
 */
class EmailService {
  private transporter: any;
  private enabled: boolean;
  private fromEmail: string;
  private toEmail: string;

  constructor() {
    this.enabled = process.env.EMAIL_ENABLED === 'true';
    this.fromEmail = process.env.EMAIL_FROM || 'bot@binance-trading.com';
    this.toEmail = process.env.EMAIL_TO || '';

    if (this.enabled) {
      this.initializeTransporter();
    }
  }

  private initializeTransporter() {
    // Support multiple email providers
    const provider = process.env.EMAIL_PROVIDER || 'smtp';

    if (provider === 'gmail') {
      // Gmail configuration
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD, // Use App Password, not regular password
        },
      });
      console.log('[EmailService] Initialized with Gmail');
    } else if (provider === 'sendgrid') {
      // SendGrid configuration
      this.transporter = nodemailer.createTransport({
        host: 'smtp.sendgrid.net',
        port: 587,
        auth: {
          user: 'apikey',
          pass: process.env.SENDGRID_API_KEY,
        },
      });
      console.log('[EmailService] Initialized with SendGrid');
    } else {
      // Generic SMTP configuration
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        },
      });
      console.log('[EmailService] Initialized with SMTP');
    }
  }

  /**
   * Send an email
   */
  async sendEmail(
    subject: string,
    htmlBody: string,
    textBody?: string
  ): Promise<boolean> {
    if (!this.enabled) {
      console.log('[EmailService] Email disabled, skipping send');
      return false;
    }

    if (!this.toEmail) {
      console.error('[EmailService] No recipient email configured (EMAIL_TO)');
      return false;
    }

    try {
      const mailOptions = {
        from: this.fromEmail,
        to: this.toEmail,
        subject,
        html: htmlBody,
        text: textBody || htmlBody.replace(/<[^>]*>/g, ''), // Strip HTML for text version
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log(`[EmailService] Email sent: ${info.messageId}`);
      return true;
    } catch (error) {
      console.error('[EmailService] Error sending email:', error);
      return false;
    }
  }

  /**
   * Test email configuration
   */
  async testConnection(): Promise<boolean> {
    if (!this.enabled) {
      console.log('[EmailService] Email disabled');
      return false;
    }

    try {
      await this.transporter.verify();
      console.log('[EmailService] Connection verified successfully');
      return true;
    } catch (error) {
      console.error('[EmailService] Connection verification failed:', error);
      return false;
    }
  }

  /**
   * Check if email service is enabled and configured
   */
  isConfigured(): boolean {
    return this.enabled && !!this.toEmail;
  }
}

export default new EmailService();

