/**
 * Subscribe a Facebook Page to webhooks for real-time comment notifications.
 * Must be called when connecting a Facebook Page so Meta delivers webhook events.
 *
 * @param pageId - The Facebook Page ID
 * @param accessToken - Page access token
 * @returns Object with success status and optional error message
 */
export async function subscribePageToWebhooks(
  pageId: string,
  accessToken: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`https://graph.facebook.com/v24.0/${pageId}/subscribed_apps?subscribed_fields=feed&access_token=${accessToken}`, { method: 'POST' });
    const data = await response.json();

    if (response.ok && data.success === true) return { success: true };

    return { success: false, error: data.error?.message || `HTTP ${response.status}` };
  } catch (error: any) {
    console.error('[Webhook] FB subscribe error:', error?.message);
    return { success: false, error: error?.message };
  }
}
