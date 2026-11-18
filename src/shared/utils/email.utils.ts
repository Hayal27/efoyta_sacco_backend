import nodemailer from 'nodemailer';
import { env } from '../../config/env';

// Create Gmail / Custom SMTP Transporter
const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST || 'smtp.gmail.com',
  port: env.SMTP_PORT || 587,
  secure: env.SMTP_PORT === 465, // true for 465, false for 587 (STARTTLS)
  auth: {
    user: env.SMTP_USER || 'kidoastu1993@gmail.com',
    pass: env.SMTP_PASS || 'ylvwplprlzvjbkre',
  },
  tls: {
    rejectUnauthorized: false,
  },
});

export async function sendOtpEmail(to: string, otpCode: string, title: string = 'Verification Code') {
  const expiryMins = env.OTP_EXPIRY_MINUTES || 15;
  const sender = env.EMAIL_FROM || env.SMTP_FROM || `"EFOYTA SACCO" <${env.SMTP_USER || 'kidoastu1993@gmail.com'}>`;

  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
      <div style="background: linear-gradient(135deg, #064e3b 0%, #0B5642 50%, #062e22 100%); padding: 24px; text-align: center; color: #ffffff;">
        <h2 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: 0.5px;">EFOYTA SACCO</h2>
        <p style="margin: 4px 0 0 0; font-size: 12px; color: #6ee7b7; text-transform: uppercase; font-weight: 600; letter-spacing: 1px;">Security &amp; Multi-Factor Verification</p>
      </div>

      <div style="padding: 24px 28px;">
        <p style="color: #334155; font-size: 14px; line-height: 1.5; margin: 0 0 16px 0;">
          Dear Member, you have requested a secure verification code for <strong>${title}</strong>.
        </p>

        <div style="background-color: #f8fafc; border: 2px dashed #059669; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0;">
          <p style="color: #64748b; font-size: 11px; text-transform: uppercase; font-weight: 700; letter-spacing: 1px; margin: 0 0 8px 0;">One-Time Passcode (OTP)</p>
          <span style="font-size: 36px; font-weight: 900; letter-spacing: 8px; color: #065f46; font-family: monospace;">${otpCode}</span>
          <p style="color: #059669; font-size: 12px; font-weight: 600; margin: 10px 0 0 0;">⏱️ Valid for ${expiryMins} minutes. Never share this code.</p>
        </div>

        <p style="color: #64748b; font-size: 12px; line-height: 1.5; margin: 0;">
          If you did not request this verification code, please ignore this email or contact EFOYTA customer service immediately.
        </p>
      </div>

      <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px; text-align: center; font-size: 11px; color: #94a3b8;">
        © ${new Date().getFullYear()} EFOYTA SACCO Management System • Automated Security Channel
      </div>
    </div>
  `;

  try {
    const info = await transporter.sendMail({
      from: sender,
      to,
      subject: `[EFOYTA SACCO] ${title}: ${otpCode}`,
      html: htmlContent,
    });
    console.info(`📧 Sent OTP email to ${to}: ${info.messageId}`);
    return true;
  } catch (err) {
    console.error(`❌ Failed to send OTP email to ${to}:`, err);
    return false;
  }
}
