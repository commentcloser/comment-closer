# Subscribe Instagram Account to Webhooks

## Problem
Real comments don't trigger webhooks because the Instagram Business Account is not properly subscribed.

## Solution
Use Graph API Explorer to manually subscribe:

### Method 1: Graph API Explorer (Recommended)

1. Go to: https://developers.facebook.com/tools/explorer

2. Select your App from dropdown (top right)

3. Get a User Access Token:
   - Click "Generate Access Token"
   - Select permissions: `instagram_basic`, `instagram_manage_comments`, `pages_read_engagement`, `pages_manage_metadata`

4. In the API call field, enter:
   ```
   /17841462600084884/subscribed_apps
   ```

5. Change HTTP method to POST

6. Add these fields in "Add a Field" section:
   - `subscribed_fields`: `comments`

7. Click "Submit"

8. You should see: `{"success": true}`

### Method 2: CURL Command

Open terminal and run:

```bash
curl -X POST "https://graph.facebook.com/v18.0/17841462600084884/subscribed_apps?subscribed_fields=comments&access_token=YOUR_USER_ACCESS_TOKEN"
```

Replace `YOUR_USER_ACCESS_TOKEN` with a User Access Token that has `instagram_manage_comments` permission.

### Method 3: Check Current Subscription

To see if it's already subscribed:

```bash
curl -X GET "https://graph.facebook.com/v18.0/17841462600084884/subscribed_apps?access_token=YOUR_USER_ACCESS_TOKEN"
```

Should return:
```json
{
  "data": [
    {
      "id": "YOUR_APP_ID",
      "subscribed_fields": ["comments"]
    }
  ]
}
```

## After Subscribing

1. Post a NEW comment on elio.dev Instagram
2. Check Vercel logs: `vercel logs --follow https://my-comments-rosy.vercel.app`
3. You should see:
   - "🚨🚨🚨 WEBHOOK POST RECEIVED AT"
   - "Entry 0 ID: 17841462600084884" (NOT "0")
   - "✅ [Webhook] Found connected page: elio.dev"
   - "✅ [Webhook] Comment created"

## Troubleshooting

### If subscription fails with permission error:
- Your app needs `instagram_manage_comments` permission approved
- For testing, use a Test User or App Admin account
- For production, submit for App Review

### If subscription succeeds but webhooks still don't arrive:
1. Check the Instagram account is connected in Meta Dashboard → Instagram → Configuration
2. Verify webhook callback URL is reachable: `https://my-comments-rosy.vercel.app/api/webhooks/instagram`
3. Check App is in Live mode (not Development mode)

## Important Notes

- The Instagram ID to subscribe is: **17841462600084884** (the one in your database)
- NOT 18524097467261 (the other one shown in screenshots)
- Each Instagram Business Account needs separate subscription
- Test webhooks (entry.id: "0") don't require subscription, but real comments do
