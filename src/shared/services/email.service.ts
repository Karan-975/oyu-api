import nodemailer from 'nodemailer';
import { config } from '../../config/config';
import { logger } from '../utils/logger';

class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.port === 465,
      auth: { user: config.email.user, pass: config.email.pass },
    });
  }

  private async send(to: string, subject: string, html: string) {
    if (!config.email.host || !config.email.user || !config.email.pass) {
      logger.warn(`[EMAIL] SMTP is not configured. Skipped: ${to} | ${subject}`);
      return;
    }
    await this.transporter.sendMail({
      from: `"${config.email.fromName}" <${config.email.from}>`,
      to,
      subject,
      html,
    });
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private professionalTemplate(options: {
    firstName: string;
    title: string;
    message: string;
    category: string;
    actionUrl?: string;
    actionLabel?: string;
    details?: Record<string, string | undefined>;
    notice?: string;
    reference?: string;
  }) {
    const details = Object.entries(options.details ?? {})
      .filter(([, value]) => Boolean(value))
      .map(([label, value]) => `
        <tr>
          <td style="padding:8px 0;color:#64748b;font-size:13px;width:140px;">${this.escapeHtml(label)}</td>
          <td style="padding:8px 0;color:#0f172a;font-size:13px;font-weight:600;">${this.escapeHtml(value!)}</td>
        </tr>
      `)
      .join('');

    return `
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width,initial-scale=1">
          <meta name="color-scheme" content="light">
          <title>${this.escapeHtml(options.title)}</title>
        </head>
        <body style="margin:0;padding:0;background:#eef4f2;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
          <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
            ${this.escapeHtml(options.message)}
          </div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef4f2;padding:28px 12px;">
            <tr>
              <td align="center">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #d7e5e1;box-shadow:0 8px 30px rgba(15,76,68,.08);">
                  <tr>
                    <td style="background:#087f72;padding:24px 32px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                        <tr>
                          <td>
                            <div style="font-size:22px;color:#ffffff;font-weight:800;letter-spacing:-.4px;">OYU Green</div>
                            <div style="font-size:11px;color:#bff5e9;margin-top:3px;letter-spacing:.5px;">FIELD OPERATIONS PLATFORM</div>
                          </td>
                          <td align="right" style="font-size:11px;color:#d8fff6;">Official Communication</td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:30px 32px;">
                      <div style="display:inline-block;padding:6px 10px;border-radius:999px;background:#e6f7f3;color:#087f72;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;">${this.escapeHtml(options.category)}</div>
                      <h1 style="font-size:24px;line-height:1.35;color:#0f172a;margin:18px 0 16px;font-weight:750;">${this.escapeHtml(options.title)}</h1>
                      <p style="font-size:15px;line-height:1.7;margin:0 0 8px;">Dear ${this.escapeHtml(options.firstName || 'User')},</p>
                      <p style="font-size:15px;line-height:1.7;margin:0;color:#334155;">${this.escapeHtml(options.message)}</p>
                      ${details ? `
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:22px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
                          <tr>
                            <td style="padding:12px 16px;">
                              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${details}</table>
                            </td>
                          </tr>
                        </table>
                      ` : ''}
                      ${options.actionUrl ? `
                        <table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:26px;">
                          <tr>
                            <td style="background:#087f72;border-radius:8px;">
                              <a href="${this.escapeHtml(options.actionUrl)}" style="display:inline-block;color:#ffffff;text-decoration:none;padding:13px 22px;font-size:14px;font-weight:700;">${this.escapeHtml(options.actionLabel ?? 'View details')}</a>
                            </td>
                          </tr>
                        </table>
                      ` : ''}
                      ${options.notice ? `
                        <div style="margin-top:24px;padding:12px 14px;border-left:3px solid #d8a514;background:#fffaf0;color:#6b5210;font-size:12px;line-height:1.6;">
                          ${this.escapeHtml(options.notice)}
                        </div>
                      ` : ''}
                      <p style="font-size:13px;line-height:1.6;color:#475569;margin:28px 0 0;">
                        Sincerely,<br><strong>OYU Green Operations Team</strong>
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="background:#f8fafc;padding:18px 32px;color:#64748b;font-size:11px;line-height:1.6;text-align:center;border-top:1px solid #e2e8f0;">
                      This automated message was sent by the OYU Green Field Operations Platform.<br>
                      Please do not reply directly to this email.
                      ${options.reference ? `<br>Reference: ${this.escapeHtml(options.reference)}` : ''}
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

  async sendOperationalNotification(options: {
    email: string;
    firstName: string;
    title: string;
    message: string;
    category: string;
    actionUrl?: string;
    actionLabel?: string;
    details?: Record<string, string | undefined>;
  }) {
    const html = this.professionalTemplate({
      ...options,
      notice: 'For security and accountability, access operational records only through the official OYU Green platform.',
    });
    await this.send(options.email, `[OYU Green] ${options.title}`, html);
  }

  async sendPasswordReset(email: string, firstName: string, resetUrl: string) {
    const html = this.professionalTemplate({
      firstName,
      title: 'Password Reset Request',
      message: 'We received a request to reset the password for your OYU Green account. Use the secure button below to create a new password.',
      category: 'Account security',
      actionUrl: resetUrl,
      actionLabel: 'Reset password securely',
      details: {
        'Link validity': '1 hour',
        Account: email,
      },
      notice: 'If you did not request this password reset, do not use the link. Your existing password will remain unchanged.',
    });
    await this.send(email, '[OYU Green] Password Reset Request', html);
  }

  async sendWelcome(email: string, firstName: string, loginUrl: string, tempPassword?: string) {
    const html = this.professionalTemplate({
      firstName,
      title: 'Your OYU Green Account Is Ready',
      message: 'An account has been created for you on the OYU Green Borehole Rehabilitation and Monitoring Platform.',
      category: 'Account onboarding',
      actionUrl: loginUrl,
      actionLabel: 'Sign in to OYU Green',
      details: {
        Username: email,
        'Temporary password': tempPassword,
      },
      notice: tempPassword
        ? 'For your security, sign in and change the temporary password immediately. Do not share your credentials with anyone.'
        : 'Keep your account credentials confidential and access the platform only through official OYU Green links.',
    });
    await this.send(email, '[OYU Green] Your Account Is Ready', html);
  }

  async sendNotification(email: string, subject: string, title: string, body: string) {
    const html = this.professionalTemplate({
      firstName: 'User',
      title,
      message: body,
      category: 'System notification',
      notice: 'This is an official automated communication from OYU Green.',
    });
    await this.send(email, subject, html);
  }
}

export const emailService = new EmailService();
