/**
 * Email Service
 *
 * Sends transactional emails (verification codes, etc.) via SMTP / nodemailer.
 * If SMTP credentials are not configured the email is logged to stdout — useful
 * for local development without an external mail server.
 */

import nodemailer from 'nodemailer';
import { config } from '../../config';

function buildTransporter() {
  const { host, port, user, pass } = config.email;

  if (!user || !pass) {
    // Ethereal-style no-op transport for dev/test
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

function verificationEmailHtml(code: string, name: string | null): string {
  const displayName = name ?? 'usuário';
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Confirmação de e-mail – Contracta</title>
</head>
<body style="margin:0;padding:0;background:#0f1117;font-family:'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0"
               style="background:#1a1d27;border-radius:12px;border:1px solid #2a2d3e;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="padding:32px 40px 24px;border-bottom:1px solid #2a2d3e;text-align:center;">
              <div style="display:inline-flex;align-items:center;gap:10px;">
                <div style="width:36px;height:36px;background:linear-gradient(135deg,#6366f1,#8b5cf6);
                            border-radius:8px;display:inline-block;"></div>
                <span style="color:#e2e8f0;font-size:20px;font-weight:700;letter-spacing:0.05em;">
                  Contracta
                </span>
              </div>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h2 style="color:#e2e8f0;font-size:22px;font-weight:600;margin:0 0 12px;">
                Confirme seu e-mail 📩
              </h2>
              <p style="color:#94a3b8;font-size:15px;line-height:1.6;margin:0 0 28px;">
                Olá, <strong style="color:#c4c9d4;">${displayName}</strong>! Use o código abaixo
                para confirmar sua conta. Ele expira em <strong style="color:#c4c9d4;">15 minutos</strong>.
              </p>

              <!-- Code box -->
              <div style="background:#0f1117;border:1px solid #6366f1;border-radius:10px;
                          padding:24px;text-align:center;margin-bottom:28px;">
                <span style="color:#a5b4fc;font-size:13px;letter-spacing:0.1em;
                             text-transform:uppercase;display:block;margin-bottom:10px;">
                  Código de verificação
                </span>
                <span style="color:#ffffff;font-size:38px;font-weight:700;
                             letter-spacing:0.25em;font-family:monospace;">
                  ${code}
                </span>
              </div>

              <p style="color:#64748b;font-size:13px;line-height:1.5;margin:0;">
                Se você não criou uma conta na Contracta, ignore este e-mail com segurança.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #2a2d3e;text-align:center;">
              <p style="color:#475569;font-size:12px;margin:0;">
                © ${new Date().getFullYear()} Contracta · Análise inteligente de contratos
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export const emailService = {
  async sendVerificationCode(to: string, code: string, name: string | null): Promise<void> {
    const transporter = buildTransporter();

    if (!transporter) {
      // Dev fallback — print to console so the developer can copy the code
      console.log(
        `\n[EmailService] ⚠️  SMTP not configured. Verification code for ${to}: ${code}\n`,
      );
      return;
    }

    await transporter.sendMail({
      from: config.email.from,
      to,
      subject: `${code} – Confirme seu e-mail na Contracta`,
      html: verificationEmailHtml(code, name),
      text: `Seu código de verificação é: ${code}\nEle expira em 15 minutos.`,
    });
  },
};
