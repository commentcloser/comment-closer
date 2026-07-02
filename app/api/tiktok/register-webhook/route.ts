import { NextRequest, NextResponse } from 'next/server';

/**
 * One-time TikTok account webhook registration (app-level).
 *
 * POST /api/tiktok/register-webhook
 *
 * Registers (or updates) the comment.update webhook callback URL
 * for this developer app. No user access token needed — uses only
 * app_id + secret. Idempotent: safe to call multiple times.
 *
 * Protected by ADMIN_SECRET header to prevent unauthorized calls.
 */
export async function POST(request: NextRequest) {
  const adminSecret = request.headers.get('x-admin-secret');
  if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const appId = process.env.TIKTOK_CLIENT_KEY;
  const secret = process.env.TIKTOK_CLIENT_SECRET;

  if (!appId || !secret) {
    return NextResponse.json({ error: 'TIKTOK_CLIENT_KEY or TIKTOK_CLIENT_SECRET not set' }, { status: 500 });
  }

  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  const callbackUrl = `${baseUrl}/api/webhooks/tiktok`;

  const res = await fetch('https://business-api.tiktok.com/open_api/v1.3/business/webhook/update/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: appId,
      secret,
      event_type: 'COMMENT',
      callback_url: callbackUrl,
    }),
  });

  const data = await res.json();

  console.log('[TikTok Webhook Registration]', JSON.stringify(data));

  if (data.code === 0) {
    return NextResponse.json({ success: true, callback_url: callbackUrl, data: data.data });
  }

  return NextResponse.json({ success: false, code: data.code, message: data.message }, { status: 400 });
}
