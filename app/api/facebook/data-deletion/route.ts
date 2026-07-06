import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

/**
 * Meta Data Deletion Callback
 * 
 * This endpoint handles data deletion requests from Meta (Facebook).
 * When a user requests data deletion through Meta, Meta will call this endpoint.
 * 
 * Meta Documentation: https://developers.facebook.com/docs/apps/delete-data
 * 
 * Expected flow:
 * 1. Meta sends POST request with signed_request
 * 2. We verify the signature using FACEBOOK_CLIENT_SECRET
 * 3. Extract user_id from the payload
 * 4. Delete all user data
 * 5. Return confirmation URL
 */

// Helper function to verify and parse signed_request from Meta
function parseSignedRequest(signedRequest: string, appSecret: string): any {
  try {
    const [signature, payload] = signedRequest.split('.');
    
    if (!signature || !payload) {
      throw new Error('Invalid signed_request format');
    }

    // Decode the payload
    const decodedPayload = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
    
    // Verify the signature
    const expectedSignature = crypto
      .createHmac('sha256', appSecret)
      .update(payload)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    if (signature !== expectedSignature) {
      throw new Error('Invalid signature');
    }

    return JSON.parse(decodedPayload);
  } catch (error) {
    throw new Error(`Failed to parse signed_request: ${error}`);
  }
}

// Sign an opaque, verifiable status code for a Facebook user id, so the status
// endpoint can only be polled by someone who received it from the POST (Meta) —
// closing the account-existence enumeration oracle (SEC-5). No storage needed.
function signDeletionCode(facebookUserId: string): string {
  const secret = process.env.FACEBOOK_CLIENT_SECRET || '';
  const mac = crypto.createHmac('sha256', secret).update(facebookUserId).digest('hex');
  return `${facebookUserId}.${mac}`;
}

function verifyDeletionCode(code: string | null): string | null {
  if (!code) return null;
  const dot = code.lastIndexOf('.');
  if (dot <= 0) return null;
  const facebookUserId = code.slice(0, dot);
  const mac = code.slice(dot + 1);
  const secret = process.env.FACEBOOK_CLIENT_SECRET || '';
  const expected = crypto.createHmac('sha256', secret).update(facebookUserId).digest('hex');
  try {
    if (mac.length === expected.length && crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) {
      return facebookUserId;
    }
  } catch {
    // fall through
  }
  return null;
}

// Helper function to delete all user data
async function deleteUserData(facebookUserId: string): Promise<{ success: boolean; message: string }> {
  try {
    // Find the user by their Facebook account providerAccountId
    const account = await prisma.account.findFirst({
      where: {
        provider: 'facebook',
        providerAccountId: facebookUserId,
      },
      include: {
        user: true,
      },
    });

    if (!account) {
      return {
        success: false,
        message: `No user found with Facebook ID: ${facebookUserId}`,
      };
    }

    const userId = account.userId;

    // Delete all comments
    const deletedComments = await prisma.comment.deleteMany({
      where: {
        connectedPage: {
          userId: userId,
        },
      },
    });

    // Delete all connected pages (this will cascade delete comments)
    const deletedPages = await prisma.connectedPage.deleteMany({
      where: {
        userId: userId,
      },
    });

    // Delete all accounts (OAuth accounts)
    const deletedAccounts = await prisma.account.deleteMany({
      where: {
        userId: userId,
      },
    });

    // Delete all sessions
    const deletedSessions = await prisma.session.deleteMany({
      where: {
        userId: userId,
      },
    });

    // Finally, delete the user (this will cascade delete any remaining related data)
    await prisma.user.delete({
      where: {
        id: userId,
      },
    });

    return {
      success: true,
      message: `Successfully deleted all data for user ${userId} (Facebook ID: ${facebookUserId}). Deleted: ${deletedComments.count} comments, ${deletedPages.count} pages, ${deletedAccounts.count} accounts, ${deletedSessions.count} sessions.`,
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Error deleting user data: ${error.message}`,
    };
  }
}

// POST: Handle data deletion request from Meta
export async function POST(request: NextRequest) {
  try {
    const appSecret = process.env.FACEBOOK_CLIENT_SECRET;
    
    if (!appSecret) {
      console.error('[Data Deletion] FACEBOOK_CLIENT_SECRET not configured');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Get the signed_request from the request body
    const body = await request.json();
    const signedRequest = body.signed_request;

    if (!signedRequest) {
      console.error('[Data Deletion] Missing signed_request in request body');
      return NextResponse.json(
        { error: 'Missing signed_request parameter' },
        { status: 400 }
      );
    }

    // Parse and verify the signed request
    let payload;
    try {
      payload = parseSignedRequest(signedRequest, appSecret);
    } catch (error: any) {
      console.error('[Data Deletion] Failed to verify signed_request:', error.message);
      return NextResponse.json(
        { error: 'Invalid signed_request' },
        { status: 400 }
      );
    }

    const facebookUserId = payload.user_id;

    if (!facebookUserId) {
      console.error('[Data Deletion] Missing user_id in payload');
      return NextResponse.json(
        { error: 'Missing user_id in request' },
        { status: 400 }
      );
    }

    console.log(`[Data Deletion] Processing deletion request for Facebook user ID: ${facebookUserId}`);

    // Delete user data
    const result = await deleteUserData(facebookUserId);

    if (!result.success) {
      console.error(`[Data Deletion] ${result.message}`);
      return NextResponse.json(
        { error: result.message },
        { status: 500 }
      );
    }

    console.log(`[Data Deletion] ${result.message}`);

    // Return confirmation URL
    // Meta expects a URL where they can check the deletion status
    let baseUrl = process.env.NEXTAUTH_URL;
    if (!baseUrl && process.env.VERCEL_URL) {
      baseUrl = `https://${process.env.VERCEL_URL}`;
    }
    if (!baseUrl) {
      baseUrl = 'https://commentcloser.com'; // Fallback
    }
    
    const code = signDeletionCode(facebookUserId);
    const confirmationUrl = `${baseUrl}/api/facebook/data-deletion?code=${encodeURIComponent(code)}`;

    return NextResponse.json({
      url: confirmationUrl,
      confirmation_code: code,
    });
  } catch (error: any) {
    console.error('[Data Deletion] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET: Status check endpoint (Meta can call this to verify deletion status)
export async function GET(request: NextRequest) {
  // Only accept an opaque, HMAC-signed code issued by the POST above. This stops
  // the endpoint being polled with a guessed user_id to test whether an arbitrary
  // Facebook user is a customer (SEC-5).
  const code = request.nextUrl.searchParams.get('code');
  const facebookUserId = verifyDeletionCode(code);

  if (!facebookUserId) {
    return NextResponse.json({ error: 'Missing or invalid code' }, { status: 400 });
  }

  const account = await prisma.account.findFirst({
    where: {
      provider: 'facebook',
      providerAccountId: facebookUserId,
    },
  });

  return NextResponse.json(
    account
      ? { status: 'pending', message: 'Data deletion is in progress' }
      : { status: 'completed', message: 'User data has been deleted' }
  );
}
