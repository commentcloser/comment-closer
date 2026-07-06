import { NextRequest, NextResponse } from 'next/server';
import { registerTikTokWebhook } from '@/lib/tiktokApi';

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
 * (The OAuth callback now also self-heals this on every connect — INTEG-6.)
 */
export async function POST(request: NextRequest) {
  const adminSecret = request.headers.get('x-admin-secret');
  if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const result = await registerTikTokWebhook();
  console.log('[TikTok Webhook Registration]', JSON.stringify(result));

  if (result.success) {
    return NextResponse.json({ success: true, callback_url: result.message });
  }

  return NextResponse.json({ success: false, message: result.message }, { status: 400 });
}
