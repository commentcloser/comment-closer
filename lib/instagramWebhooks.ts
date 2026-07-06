/**
 * Subscribe an Instagram Business Account to webhooks for real-time comment notifications.
 *
 * Instagram webhooks are delivered through the linked Facebook Page's feed subscription.
 * We subscribe the Facebook Page to `feed` webhooks, which includes Instagram comment events.
 * The `/{instagram-account-id}/subscribed_apps` endpoint does NOT exist — subscriptions
 * must go through the linked Facebook Page.
 *
 * @param instagramAccountId - The Instagram Business Account ID
 * @param accessToken - Page access token (from linked Facebook Page)
 * @param facebookPageId - Optional: The linked Facebook Page ID. If not provided, will be resolved via /me endpoint.
 * @returns Object with success status and optional error message
 */
import { graphFetch } from './graphFetch';

export async function subscribeInstagramToWebhooks(
  instagramAccountId: string,
  accessToken: string,
  facebookPageId?: string | null
): Promise<{ success: boolean; error?: string; facebookPageId?: string }> {
  try {
    // Resolve the linked Facebook Page ID if not provided
    let resolvedPageId = facebookPageId || null;

    if (!resolvedPageId) {
      try {
        const meResponse = await graphFetch(`https://graph.facebook.com/v24.0/me?access_token=${accessToken}`);
        const meData = await meResponse.json();
        if (meResponse.ok && meData.id) {
          resolvedPageId = meData.id;
        }
      } catch {
        /* continue */
      }
    }

    if (!resolvedPageId) {
      return {
        success: false,
        error: 'Could not resolve linked Facebook Page ID. The access token may be invalid or the Instagram account has no linked Facebook Page.',
      };
    }

    // Subscribe the Facebook Page to feed webhooks — this enables Instagram comment delivery
    const response = await graphFetch(
      `https://graph.facebook.com/v24.0/${resolvedPageId}/subscribed_apps?subscribed_fields=feed&access_token=${accessToken}`,
      undefined,
      { method: 'POST' }
    );
    const data = await response.json();

    if (response.ok && data.success === true) {
      console.log(`[Webhook] IG subscribe success: Instagram ${instagramAccountId} via Facebook Page ${resolvedPageId}`);
      return { success: true, facebookPageId: resolvedPageId };
    }

    return {
      success: false,
      error: data.error?.message || `HTTP ${response.status}`,
      facebookPageId: resolvedPageId,
    };
  } catch (error: any) {
    console.error('[Webhook] IG subscribe error:', error?.message);
    return { success: false, error: error?.message };
  }
}
