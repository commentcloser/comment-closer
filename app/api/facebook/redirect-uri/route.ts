import { NextRequest, NextResponse } from 'next/server';

/**
 * Returns the Facebook OAuth Redirect URI that should be configured in Facebook App settings
 */
export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXTAUTH_URL || 
                  process.env.AUTH_URL || 
                  request.headers.get('origin') || 
                  'https://commentcloser.com';
  
  const redirectUri = `${baseUrl}/api/auth/callback/facebook`;
  
  return NextResponse.json({
    redirectUri,
    baseUrl,
    message: 'Add this Redirect URI to your Facebook App settings',
    instructions: [
      '1. Go to https://developers.facebook.com/apps',
      '2. Select your app',
      '3. Go to Settings > Basic',
      '4. Add this URI to "Valid OAuth Redirect URIs":',
      `   ${redirectUri}`,
      '5. Also add to "App Domains" (without https://):',
      `   ${new URL(baseUrl).hostname}`,
    ],
  });
}

