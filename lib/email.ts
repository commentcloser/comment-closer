import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: EmailOptions) {
  if (!resend || !process.env.RESEND_API_KEY) {
    return { success: true, id: 'dev-mode' };
  }
  try {
    const fromEmail = process.env.EMAIL_FROM || 'onboarding@resend.dev';
    const result = await resend.emails.send({ from: fromEmail, to, subject, html });
    return { success: true, id: result.data?.id };
  } catch {
    throw new Error('Failed to send email');
  }
}

function buildEmail(content: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <style>
    body { margin:0; padding:0; background:#fafafa; }
    @media (max-width:600px) {
      .wrap { padding: 24px 16px !important; }
      .card { border-radius: 12px !important; padding: 32px 24px !important; }
      .btn  { display: block !important; text-align: center !important; }
      h1    { font-size: 22px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td class="wrap" align="center" style="padding:48px 24px;">

        <!-- Logo row -->
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
          <tr>
            <td>
              <p style="margin:0;font-size:15px;font-weight:600;color:#09090b;letter-spacing:-0.2px;">Comment Closer</p>
            </td>
          </tr>
        </table>

        <!-- Card -->
        <table role="presentation" class="card" cellpadding="0" cellspacing="0"
               style="max-width:520px;width:100%;background:#ffffff;border-radius:16px;border:1px solid #e4e4e7;padding:48px 40px;">
          <tr>
            <td>
              ${content}
            </td>
          </tr>
        </table>

        <!-- Footer -->
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:32px;max-width:520px;width:100%;">
          <tr>
            <td align="center">
              <p style="margin:0;font-size:12px;color:#a1a1aa;line-height:1.6;">
                © ${new Date().getFullYear()} Comment Closer &nbsp;·&nbsp; You're receiving this because you have an account with us.
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

export async function sendVerificationEmail(email: string, token: string, name?: string) {
  const baseUrl = process.env.NEXTAUTH_URL || process.env.AUTH_URL || 'https://commentcloser.com';
  const url = `${baseUrl}/verify-email?token=${token}`;
  const firstName = name ? name.split(' ')[0] : null;

  const content = `
    <!-- Icon -->
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr>
        <td style="width:44px;height:44px;background:#09090b;border-radius:10px;text-align:center;vertical-align:middle;">
          <span style="font-size:22px;line-height:44px;">✉</span>
        </td>
      </tr>
    </table>

    <!-- Heading -->
    <h1 style="margin:0 0 10px;font-size:24px;font-weight:700;color:#09090b;letter-spacing:-0.5px;line-height:1.2;">
      Verify your email address
    </h1>
    <p style="margin:0 0 32px;font-size:15px;color:#71717a;line-height:1.6;">
      Hi${firstName ? ` ${firstName}` : ''}, confirm your email to activate your Comment Closer account.
    </p>

    <!-- CTA -->
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
      <tr>
        <td>
          <a href="${url}" class="btn"
             style="display:inline-block;background:#09090b;color:#ffffff;padding:12px 28px;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;letter-spacing:0.1px;">
            Verify email
          </a>
        </td>
      </tr>
    </table>

    <!-- Divider -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr><td style="height:1px;background:#f4f4f5;"></td></tr>
    </table>

    <!-- Meta info -->
    <p style="margin:0 0 8px;font-size:13px;color:#a1a1aa;line-height:1.5;">
      This link expires in <strong style="color:#52525b;">24 hours</strong>. If you didn't create an account, you can ignore this email.
    </p>
    <p style="margin:16px 0 4px;font-size:12px;color:#a1a1aa;">Or copy this link:</p>
    <p style="margin:0;font-size:11px;color:#a1a1aa;word-break:break-all;font-family:'Courier New',monospace;background:#fafafa;border:1px solid #e4e4e7;border-radius:6px;padding:10px 12px;">
      ${url}
    </p>`;

  return sendEmail({
    to: email,
    subject: 'Verify your email — Comment Closer',
    html: buildEmail(content, 'Verify your email — Comment Closer'),
  });
}

// ─── Billing emails ───────────────────────────────────────────────────────────

function billingButton(label: string, url: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
      <tr>
        <td>
          <a href="${url}" class="btn"
             style="display:inline-block;background:#09090b;color:#ffffff;padding:12px 28px;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;letter-spacing:0.1px;">
            ${label}
          </a>
        </td>
      </tr>
    </table>`;
}

export async function sendPasswordResetEmail(email: string, token: string, name?: string) {
  const baseUrl = process.env.NEXTAUTH_URL || process.env.AUTH_URL || 'https://commentcloser.com';
  const url = `${baseUrl}/reset-password?token=${token}`;
  const firstName = name ? name.split(' ')[0] : null;

  const content = `
    <!-- Icon -->
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr>
        <td style="width:44px;height:44px;background:#09090b;border-radius:10px;text-align:center;vertical-align:middle;">
          <span style="font-size:22px;line-height:44px;">🔑</span>
        </td>
      </tr>
    </table>

    <!-- Heading -->
    <h1 style="margin:0 0 10px;font-size:24px;font-weight:700;color:#09090b;letter-spacing:-0.5px;line-height:1.2;">
      Reset your password
    </h1>
    <p style="margin:0 0 32px;font-size:15px;color:#71717a;line-height:1.6;">
      Hi${firstName ? ` ${firstName}` : ''}, we received a request to reset the password for your account.
    </p>

    <!-- CTA -->
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
      <tr>
        <td>
          <a href="${url}" class="btn"
             style="display:inline-block;background:#09090b;color:#ffffff;padding:12px 28px;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;letter-spacing:0.1px;">
            Reset password
          </a>
        </td>
      </tr>
    </table>

    <!-- Divider -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr><td style="height:1px;background:#f4f4f5;"></td></tr>
    </table>

    <!-- Meta info -->
    <p style="margin:0 0 8px;font-size:13px;color:#a1a1aa;line-height:1.5;">
      This link expires in <strong style="color:#52525b;">1 hour</strong>. If you didn't request a password reset, you can safely ignore this email — your account is unchanged.
    </p>
    <p style="margin:16px 0 4px;font-size:12px;color:#a1a1aa;">Or copy this link:</p>
    <p style="margin:0;font-size:11px;color:#a1a1aa;word-break:break-all;font-family:'Courier New',monospace;background:#fafafa;border:1px solid #e4e4e7;border-radius:6px;padding:10px 12px;">
      ${url}
    </p>`;

  return sendEmail({
    to: email,
    subject: 'Reset your password — Comment Closer',
    html: buildEmail(content, 'Reset your password — Comment Closer'),
  });
}
