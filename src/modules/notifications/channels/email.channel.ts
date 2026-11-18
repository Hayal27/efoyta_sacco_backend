import nodemailer from 'nodemailer';
import { env } from '../../../config/env';

let transporter: nodemailer.Transporter | null = null;

if (env.SMTP_HOST && env.SMTP_USER) {
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });
}

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!transporter) {
    console.warn(`[Email Mock] To: ${to} | Subject: ${subject}`);
    return true;
  }

  try {
    const sender = env.EMAIL_FROM || env.SMTP_FROM || `"EFOYTA SACCO" <${env.SMTP_USER}>`;
    const info = await transporter.sendMail({
      from: sender,
      to,
      subject,
      html,
    });
    console.info('[Email Sent Successfully]', { to, messageId: info.messageId, subject });
    return true;
  } catch (err) {
    console.error('[Email Failed]', err);
    return false;
  }
}
