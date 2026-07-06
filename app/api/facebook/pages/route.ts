import { NextRequest, NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { graphFetch } from '@/lib/graphFetch';
import { subscribeInstagramToWebhooks } from '@/lib/instagramWebhooks';
import { subscribePageToWebhooks } from '@/lib/facebookWebhooks';
import { validateWebSourceUrl, isValidKeywordList } from '@/lib/validators';

const { auth } = NextAuth(authOptions);

// Cache for pages data (5 minutes)
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const pagesCache = new Map<string, { data: any; timestamp: number }>();

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const dbOnly = request.nextUrl.searchParams.get('dbOnly') === 'true';

    // Get connected pages from database (exclude soft-deleted/disconnected)
    let connectedPages = await prisma.connectedPage.findMany({
      where: {
        userId: session.user.id,
        disconnectedAt: null,
      },
      select: {
        id: true,
        pageId: true,
        pageName: true,
        provider: true,
        profileImageUrl: true,
        createdAt: true,
        needsReconnect: true,
        pageAccessToken: true, // Include to compare with fresh tokens
        adAccountId: true, // Include ad account ID
        autoReplyEnabled: true,
        autoModerationEnabled: true,
        autoHideNegativeEnabled: true,
        autoNegativeAction: true,
        autoModerateReplies: true,
        customReplyPrompt: true,
        webSourceUrl: true,
        webSourceEnabled: true,
        replyDelaySeconds: true,
        replyUserCooldownMinutes: true,
        replyOnlyFirstComment: true,
        replyMinCommentLength: true,
        maxReplyLength: true,
        replyBlocklistKeywords: true,
        replyAllowlistKeywords: true,
        replyAllowlistEnabled: true,
        manualReviewEnabled: true,
      },
    });

    const hadConnectedPagesInitially = connectedPages.length > 0;

    if (dbOnly) {
      // Override with permanent Graph API URLs for Facebook (CDN URLs expire)
      const pagesWithFreshImages = connectedPages.map((cp) => ({
        ...cp,
        profileImageUrl: cp.provider === 'facebook'
          ? `https://graph.facebook.com/${cp.pageId}/picture?type=large`
          : cp.profileImageUrl,
      }));
      return NextResponse.json({ connectedPages: pagesWithFreshImages, pages: [], instagramPages: [] });
    }

    // Get user's Facebook account access token (don't use cache before this,
    // otherwise we might return stale data after disconnecting the account)
    const account = await prisma.account.findFirst({
      where: {
        userId: session.user.id,
        provider: 'facebook',
      },
    });

    if (!account?.access_token) {
      // Return connected pages even if Facebook account is not connected
      // This allows users to see previously connected pages
      return NextResponse.json({
        connectedPages,
        pages: [],
        instagramPages: [],
        error: connectedPages.length > 0 ? undefined : 'No Facebook account connected',
      });
    }

    // Check cache after we've confirmed the account still exists
    const cacheKey = `pages_${session.user.id}`;
    const cached = pagesCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return NextResponse.json(cached.data);
    }

    // Helper function to exchange token for long-lived token
    const exchangeToken = async (shortLivedToken: string): Promise<string | null> => {
      try {
        if (!process.env.FACEBOOK_CLIENT_ID || !process.env.FACEBOOK_CLIENT_SECRET) {
          return null;
        }
        
        const tokenExchangeUrl = `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.FACEBOOK_CLIENT_ID}&client_secret=${process.env.FACEBOOK_CLIENT_SECRET}&fb_exchange_token=${shortLivedToken}`;
        const tokenResponse = await graphFetch(tokenExchangeUrl);
        
        if (tokenResponse.ok) {
          const tokenData = await tokenResponse.json();
          const longLivedToken = tokenData.access_token;
          
          if (!longLivedToken) {
            return null;
          }
          
          // Update the stored token in database
          await prisma.account.updateMany({
            where: {
              id: account.id,
            },
            data: {
              access_token: longLivedToken,
            },
          });
          
          return longLivedToken;
        }
      } catch (error) {
        // Token exchange failed
      }
      return null;
    };

    let accessToken = account.access_token;

    // ALWAYS try to exchange token first to ensure we have a long-lived token
    
    // Verify user token has required permissions
    try {
      const userTokenDebugUrl = `https://graph.facebook.com/v18.0/debug_token?input_token=${accessToken}&access_token=${accessToken}`;
      const userTokenDebugResponse = await graphFetch(userTokenDebugUrl);
      
      if (userTokenDebugResponse.ok) {
        const userTokenDebugData = await userTokenDebugResponse.json();
        const userScopes = userTokenDebugData.data?.scopes || [];
        // Check if user token has pages_read_engagement permission
      }
    } catch (debugError) {
      // Error debugging user token
    }
    
    // Try to exchange token immediately if it's short-lived
    const refreshedToken = await exchangeToken(accessToken);
    if (refreshedToken) {
      accessToken = refreshedToken;
    }

    // First, verify the token has the right permissions by checking user info
    const meUrl = `https://graph.facebook.com/v18.0/me?access_token=${accessToken}`;
    const meResponse = await graphFetch(meUrl);
    
    if (!meResponse.ok) {
      const meErrorText = await meResponse.text();
      let meErrorData: any = {};
      try {
        meErrorData = JSON.parse(meErrorText);
      } catch (e) {
        // Not JSON, use as string
      }
      
      // Check if it's a rate limit error (code 4, is_transient: true)
      if (meErrorData.error?.code === 4 && meErrorData.error?.is_transient === true) {
        // Continue without verification - rate limit is temporary
      } else {
        return NextResponse.json({
          connectedPages,
          pages: [],
          instagramPages: [],
          error: 'Facebook token is invalid. Please reconnect your Facebook account.',
        });
      }
    }

    // Fetch user's Facebook pages
    // Note: We need pages_show_list permission for this to work
    // This endpoint returns Page access tokens (not user tokens) for each page
    const pagesUrl = `https://graph.facebook.com/v24.0/me/accounts?access_token=${accessToken}&fields=id,name,access_token,category,picture.type(large)&limit=100`;
    
    let pagesResponse = await graphFetch(pagesUrl);

    // If token expired, try to exchange it for a long-lived token
    if (!pagesResponse.ok) {
      const errorText = await pagesResponse.text();
      
      // Check if it's a token error
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.error?.code === 190 || errorData.error?.type === 'OAuthException') {
          // Access token expired or invalid - try to exchange for long-lived token
          const refreshedToken = await exchangeToken(accessToken);
          
          if (refreshedToken) {
            // Retry with refreshed token
            accessToken = refreshedToken;
            pagesResponse = await graphFetch(
              `https://graph.facebook.com/v24.0/me/accounts?access_token=${accessToken}&fields=id,name,access_token,picture.type(large)`
            );
          } else {
            // Could not refresh, return error
            return NextResponse.json({
              connectedPages,
              pages: [],
              instagramPages: [],
              error: 'Facebook access token expired. Please reconnect your Facebook account.',
            });
          }
        }
      } catch (e) {
        // Not JSON, continue with generic error
      }
      
      // If still not ok after refresh attempt
      if (!pagesResponse.ok) {
        return NextResponse.json({
          connectedPages,
          pages: [],
          instagramPages: [],
          error: 'Failed to fetch pages from Facebook',
        });
      }
    }

    // Parse response
    const responseText = await pagesResponse.text();
    
    let pagesData: any;
    try {
      pagesData = JSON.parse(responseText);
    } catch (parseError) {
      return NextResponse.json({
        connectedPages,
        pages: [],
        instagramPages: [],
        error: 'Invalid response from Facebook API',
      });
    }
    
    // Check for errors in response
    if (pagesData.error) {
      // Check if it's a rate limit error (code 4, is_transient: true)
      if (pagesData.error.code === 4 && pagesData.error.is_transient === true) {
        // Return connected pages from database even if we can't fetch new ones
        // This allows the app to continue working
        return NextResponse.json({
          connectedPages,
          pages: [],
          instagramPages: [],
          error: 'Facebook API rate limit reached. Please try again in a few minutes. Your connected pages are still available.',
          rateLimited: true,
        });
      }
      
      return NextResponse.json({
        connectedPages,
        pages: [],
        instagramPages: [],
        error: `Facebook API error: ${pagesData.error.message || 'Unknown error'}`,
      });
    }
    
    const facebookPages = pagesData.data || [];
    
    if (facebookPages.length > 0) {
      // Refresh stored page tokens for existing connected pages
      // Skip token verification to speed up - just update tokens directly
      // Token verification can be done on-demand when needed
      try {
        const updatePromises = facebookPages.map(async (page: any) => {
          const existingPage = connectedPages.find(cp => cp.pageId === page.id && cp.provider === 'facebook');
          if (existingPage && page.access_token) {
            // Update token directly without verification for speed
            await prisma.connectedPage.updateMany({
              where: {
                id: existingPage.id,
              },
              data: {
                pageAccessToken: page.access_token,
                updatedAt: new Date(),
              },
            });
          }
        });
        
        // Execute all updates in parallel
        await Promise.all(updatePromises);
      } catch (refreshError) {
        // Don't fail the request if token refresh fails
      }
    }

    // Return Facebook pages immediately, fetch Instagram in parallel (non-blocking)
    const facebookPagesResponse = facebookPages.map((page: any) => ({
      ...page,
      provider: 'facebook',
    }));

    // Only fetch Instagram if user has connected Instagram pages or if we need to discover them
    // Check if any connected page is Instagram or if we should check for new Instagram accounts
    const hasInstagramPages = connectedPages.some(cp => cp.provider === 'instagram');
    const shouldFetchInstagram = hasInstagramPages || facebookPages.length > 0;

    let instagramPages: any[] = [];

    if (shouldFetchInstagram) {
      // Fetch Instagram Business accounts in PARALLEL for all pages (much faster)
      const instagramPromises = facebookPages.map(async (page: any) => {
        try {
          // Check if this page has an Instagram Business account
          const instagramAccountResponse = await graphFetch(
            `https://graph.facebook.com/v18.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
          );

          if (instagramAccountResponse.ok) {
            const instagramAccountData = await instagramAccountResponse.json();
            
            if (instagramAccountData.instagram_business_account?.id) {
              const instagramAccountId = instagramAccountData.instagram_business_account.id;
              
              // Get Instagram account details
              const instagramDetailsResponse = await graphFetch(
                `https://graph.facebook.com/v18.0/${instagramAccountId}?fields=id,username,name,profile_picture_url&access_token=${page.access_token}`
              );

              if (instagramDetailsResponse.ok) {
                const instagramDetails = await instagramDetailsResponse.json();
                return {
                  id: instagramDetails.id,
                  username: instagramDetails.username || instagramDetails.name || `Instagram ${instagramDetails.id}`,
                  name: instagramDetails.name || instagramDetails.username || `Instagram ${instagramDetails.id}`,
                  profile_picture_url: instagramDetails.profile_picture_url,
                  access_token: page.access_token,
                  facebook_page_id: page.id,
                  provider: 'instagram',
                };
              }
            }
          }
        } catch (error) {
          return null;
        }
        return null;
      });

      // Wait for all Instagram fetches in parallel (much faster than sequential)
      const instagramResults = await Promise.all(instagramPromises);
      instagramPages = instagramResults.filter((page): page is any => page !== null);
    }
    
    // Auto-connect all Facebook pages for brand-new users (no connected pages yet)
    if (!hadConnectedPagesInitially && facebookPages.length > 0) {
      try {
        const now = new Date();

        // Filter out pages already connected to a different user
        const availablePages: any[] = [];
        for (const page of facebookPages.filter((p: any) => p.access_token)) {
          const takenByOther = await prisma.connectedPage.findFirst({
            where: { pageId: page.id, provider: 'facebook', disconnectedAt: null, NOT: { userId: session.user.id } },
            select: { id: true },
          });
          if (!takenByOther) availablePages.push(page);
        }

        const autoConnectedFb = await Promise.all(
          availablePages.map((page: any) =>
              prisma.connectedPage.upsert({
                where: {
                  userId_pageId_provider: {
                    userId: session.user.id,
                    pageId: page.id,
                    provider: 'facebook',
                  },
                },
                update: {
                  pageName: page.name,
                  pageAccessToken: page.access_token,
                  disconnectedAt: null,
                  updatedAt: now,
                },
                create: {
                  userId: session.user.id,
                  pageId: page.id,
                  pageName: page.name,
                  pageAccessToken: page.access_token,
                  provider: 'facebook',
                },
              })
            )
        );

        if (autoConnectedFb.length > 0) {
          connectedPages = [...connectedPages, ...autoConnectedFb];
          for (const fbPage of availablePages) {
            if (fbPage.access_token) {
              subscribePageToWebhooks(fbPage.id, fbPage.access_token).catch(() => {});
            }
          }
        }
      } catch (e) {
      }
    }

    // Auto-connect Instagram accounts for brand-new users as well
    if (!hadConnectedPagesInitially && instagramPages.length > 0) {
      try {
        const now = new Date();

        // Filter out Instagram pages already connected to a different user
        const availableIgPages: any[] = [];
        for (const page of instagramPages) {
          const takenByOther = await prisma.connectedPage.findFirst({
            where: { pageId: page.id, provider: 'instagram', disconnectedAt: null, NOT: { userId: session.user.id } },
            select: { id: true },
          });
          if (!takenByOther) availableIgPages.push(page);
        }

        const autoConnectedIg = await Promise.all(
          availableIgPages.map((page: any) =>
            prisma.connectedPage.upsert({
              where: {
                userId_pageId_provider: {
                  userId: session.user.id,
                  pageId: page.id,
                  provider: 'instagram',
                },
              },
              update: {
                pageName: page.name || page.username,
                pageAccessToken: page.access_token,
                instagramUserId: page.id,
                disconnectedAt: null,
                updatedAt: now,
              },
              create: {
                userId: session.user.id,
                pageId: page.id,
                pageName: page.name || page.username,
                pageAccessToken: page.access_token,
                instagramUserId: page.id, // Store IG Business Account ID for webhook matching
                provider: 'instagram',
              },
            })
          )
        );

        if (autoConnectedIg.length > 0) {
          connectedPages = [...connectedPages, ...autoConnectedIg];
          for (const igPage of availableIgPages) {
            subscribeInstagramToWebhooks(igPage.id, igPage.access_token).catch(() => {});
          }
        }
      } catch (e) {
      }
    }

    // Save profile image URLs to DB in background (don't await — keeps response fast)
    // Use permanent Graph API redirect URLs for Facebook pages (CDN URLs expire)
    void (async () => {
      try {
        const updates: Promise<unknown>[] = [];
        for (const cp of connectedPages) {
          let url: string | null = null;
          if (cp.provider === 'facebook') {
            // Permanent redirect URL — never expires
            url = `https://graph.facebook.com/${cp.pageId}/picture?type=large`;
          } else if (cp.provider === 'instagram') {
            // For Instagram, fetch a fresh URL from Graph API using the page token
            const ig = instagramPages.find((p: any) => p.id === cp.pageId);
            if (ig?.profile_picture_url) url = ig.profile_picture_url;
          }
          if (url && url !== cp.profileImageUrl) {
            updates.push(
              prisma.connectedPage.updateMany({
                where: { id: cp.id },
                data: { profileImageUrl: url, updatedAt: new Date() },
              })
            );
          }
        }
        if (updates.length > 0) await Promise.all(updates);
      } catch {
        // ignore
      }
    })();

    // Override with permanent Graph API URLs for Facebook (CDN URLs expire)
    const connectedPagesWithFreshImages = connectedPages.map((cp) => ({
      ...cp,
      profileImageUrl: cp.provider === 'facebook'
        ? `https://graph.facebook.com/${cp.pageId}/picture?type=large`
        : cp.profileImageUrl,
    }));

    const response = {
      connectedPages: connectedPagesWithFreshImages,
      pages: facebookPagesResponse,
      instagramPages,
    };
    
    // Store in cache before returning
    pagesCache.set(cacheKey, {
      data: response,
      timestamp: Date.now()
    });
    
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { pageId, pageName, pageAccessToken, provider = 'facebook', facebookPageId } = body;

    if (!pageId || !pageName || !pageAccessToken) {
      return NextResponse.json(
        { error: 'Missing required fields: pageId, pageName, and pageAccessToken are required' },
        { status: 400 }
      );
    }

    // For Facebook pages, verify and refresh the page access token to ensure it has the latest permissions
    let finalPageAccessToken = pageAccessToken;
    if (provider === 'facebook') {
      try {
        // Get user's Facebook account access token to debug the page token
        const account = await prisma.account.findFirst({
          where: {
            userId: session.user.id,
            provider: 'facebook',
          },
        });

        if (account?.access_token) {
          // FIRST: Check if the user's main token has the permission
          const userTokenDebugUrl = `https://graph.facebook.com/v18.0/debug_token?input_token=${account.access_token}&access_token=${account.access_token}`;
          const userTokenDebugResponse = await graphFetch(userTokenDebugUrl);
          
          let userTokenHasPermission = false;
          if (userTokenDebugResponse.ok) {
            const userTokenDebugData = await userTokenDebugResponse.json();
            const userScopes = userTokenDebugData.data?.scopes || [];
            userTokenHasPermission = userScopes.includes('pages_read_engagement');
          }
          
          // Verify the page token has the required permissions
          const debugTokenUrl = `https://graph.facebook.com/v18.0/debug_token?input_token=${pageAccessToken}&access_token=${account.access_token}`;
          const debugResponse = await graphFetch(debugTokenUrl);
          
          if (debugResponse.ok) {
            const debugData = await debugResponse.json();
            const scopes = debugData.data?.scopes || [];
            
            if (!scopes.includes('pages_read_engagement')) {
              // Only try to refresh if user token has permission
              if (userTokenHasPermission) {
                // Fetch fresh page tokens from Facebook
                const pagesUrl = `https://graph.facebook.com/v24.0/me/accounts?access_token=${account.access_token}&fields=id,name,access_token&limit=100`;
                const pagesResponse = await graphFetch(pagesUrl);
                
                if (pagesResponse.ok) {
                  const pagesData = await pagesResponse.json();
                  const page = pagesData.data?.find((p: any) => p.id === pageId);
                  
                  if (page?.access_token) {
                    // Verify the fresh token has the permission
                    const freshDebugUrl = `https://graph.facebook.com/v18.0/debug_token?input_token=${page.access_token}&access_token=${account.access_token}`;
                    const freshDebugResponse = await graphFetch(freshDebugUrl);
                    
                    if (freshDebugResponse.ok) {
                      const freshDebugData = await freshDebugResponse.json();
                      const freshScopes = freshDebugData.data?.scopes || [];
                      
                      if (freshScopes.includes('pages_read_engagement')) {
                        finalPageAccessToken = page.access_token;
                      }
                    }
                  }
                }
              }
            }
          }
        }
      } catch (error) {
        // Continue with original token if verification fails
      }
    }

    // Try to automatically detect ad account ID for Facebook pages
    let adAccountId: string | null = null;
    if (provider === 'facebook') {
      try {
        const account = await prisma.account.findFirst({
          where: {
            userId: session.user.id,
            provider: 'facebook',
          },
          select: {
            access_token: true,
          },
        });

        if (account?.access_token) {

          // Detect this user's own ad account. (A hardcoded developer ad
          // account used to be forced here for every tenant — removed.)

          // Strategy 1: Try to get ad accounts directly from the page (business portfolio ad accounts)
          // Only if we haven't found the target account yet
          if (!adAccountId) {
          // This gets ad accounts associated with the page's business portfolio
            const pageAdAccountsUrl = `https://graph.facebook.com/v24.0/${pageId}/adaccounts?access_token=${account.access_token}&fields=id,account_id,name&limit=25`;
            const pageAdAccountsResponse = await graphFetch(pageAdAccountsUrl);
            
            let foundAdAccounts = false;
            
            if (pageAdAccountsResponse.ok) {
              const pageAdAccountsData = await pageAdAccountsResponse.json();
              const pageAdAccounts = pageAdAccountsData.data || [];
              
              if (pageAdAccounts.length > 0) {
                // Use the ad account from the page's business portfolio
                adAccountId = pageAdAccounts[0].account_id || pageAdAccounts[0].id?.replace(/^act_/i, '') || null;
                foundAdAccounts = true;
              }
            } else {
              // Log why page endpoint failed
              const errorText = await pageAdAccountsResponse.text();
            }
            
            // Strategy 2: Try using page access token (for customer pages managed by you)
            if (!foundAdAccounts && finalPageAccessToken) {
            const pageTokenAdAccountsUrl = `https://graph.facebook.com/v24.0/${pageId}/adaccounts?access_token=${finalPageAccessToken}&fields=id,account_id,name&limit=25`;
            const pageTokenAdAccountsResponse = await graphFetch(pageTokenAdAccountsUrl);
            
            if (pageTokenAdAccountsResponse.ok) {
              const pageTokenAdAccountsData = await pageTokenAdAccountsResponse.json();
              const pageTokenAdAccounts = pageTokenAdAccountsData.data || [];
              
              if (pageTokenAdAccounts.length > 0) {
                adAccountId = pageTokenAdAccounts[0].account_id || pageTokenAdAccounts[0].id?.replace(/^act_/i, '') || null;
                foundAdAccounts = true;
              } else {
              }
            } else {
              const errorText = await pageTokenAdAccountsResponse.text();
              const errorMessage = errorText.substring(0, 300);
            }
          }
            
            // Strategy 3: Try to get business manager from page, then get ad accounts from business
            if (!foundAdAccounts) {
            try {
              // Get business manager ID from page
              const pageBusinessUrl = `https://graph.facebook.com/v24.0/${pageId}?access_token=${account.access_token}&fields=business`;
              const pageBusinessResponse = await graphFetch(pageBusinessUrl);
              
              if (pageBusinessResponse.ok) {
                const pageBusinessData = await pageBusinessResponse.json();
                const businessId = pageBusinessData.business?.id;
                
                if (businessId) {
                  
                  // Try /client_ad_accounts first (assigned client ad accounts - most common for customer pages)
                  const businessClientAdAccountsUrl = `https://graph.facebook.com/v24.0/${businessId}/client_ad_accounts?access_token=${account.access_token}&fields=id,account_id,name&limit=25`;
                  const businessClientAdAccountsResponse = await graphFetch(businessClientAdAccountsUrl);
                  
                  if (businessClientAdAccountsResponse.ok) {
                    const businessClientAdAccountsData = await businessClientAdAccountsResponse.json();
                    const businessClientAdAccounts = businessClientAdAccountsData.data || [];
                    
                    if (businessClientAdAccounts.length > 0) {
                      // Try to find ad account that matches page name or use the first one
                      const pageNameLower = pageName.toLowerCase();
                      const matchingClientAccount = businessClientAdAccounts.find((acc: any) => 
                        acc.name?.toLowerCase().includes(pageNameLower) ||
                        pageNameLower.includes(acc.name?.toLowerCase() || '')
                      );
                      
                      const selectedAccount = matchingClientAccount || businessClientAdAccounts[0];
                      adAccountId = selectedAccount.account_id || selectedAccount.id?.replace(/^act_/i, '') || null;
                      
                      if (matchingClientAccount) {
                      } else {
                      }
                      foundAdAccounts = true;
                    } else {
                      // If /client_ad_accounts returned empty, try /owned_ad_accounts
                      const businessOwnedAdAccountsUrl = `https://graph.facebook.com/v24.0/${businessId}/owned_ad_accounts?access_token=${account.access_token}&fields=id,account_id,name&limit=25`;
                      const businessOwnedAdAccountsResponse = await graphFetch(businessOwnedAdAccountsUrl);
                      
                      if (businessOwnedAdAccountsResponse.ok) {
                        const businessOwnedAdAccountsData = await businessOwnedAdAccountsResponse.json();
                        const businessOwnedAdAccounts = businessOwnedAdAccountsData.data || [];
                        
                        if (businessOwnedAdAccounts.length > 0) {
                          const pageNameLower = pageName.toLowerCase();
                          const matchingOwnedAccount = businessOwnedAdAccounts.find((acc: any) => 
                            acc.name?.toLowerCase().includes(pageNameLower) ||
                            pageNameLower.includes(acc.name?.toLowerCase() || '')
                          );
                          
                          const selectedAccount = matchingOwnedAccount || businessOwnedAdAccounts[0];
                          adAccountId = selectedAccount.account_id || selectedAccount.id?.replace(/^act_/i, '') || null;
                          
                          if (matchingOwnedAccount) {
                          } else {
                          }
                          foundAdAccounts = true;
                        } else {
                        }
                      } else {
                        const errorText = await businessOwnedAdAccountsResponse.text();
                        const errorMessage = errorText.substring(0, 300);
                      }
                    }
                  } else {
                    // If /client_ad_accounts failed, try /owned_ad_accounts as fallback
                    const errorText = await businessClientAdAccountsResponse.text();
                    const errorMessage = errorText.substring(0, 300);
                    const businessOwnedAdAccountsUrl = `https://graph.facebook.com/v24.0/${businessId}/owned_ad_accounts?access_token=${account.access_token}&fields=id,account_id,name&limit=25`;
                    const businessOwnedAdAccountsResponse = await graphFetch(businessOwnedAdAccountsUrl);
                    
                    if (businessOwnedAdAccountsResponse.ok) {
                      const businessOwnedAdAccountsData = await businessOwnedAdAccountsResponse.json();
                      const businessOwnedAdAccounts = businessOwnedAdAccountsData.data || [];
                      
                      if (businessOwnedAdAccounts.length > 0) {
                        const pageNameLower = pageName.toLowerCase();
                        const matchingOwnedAccount = businessOwnedAdAccounts.find((acc: any) => 
                          acc.name?.toLowerCase().includes(pageNameLower) ||
                          pageNameLower.includes(acc.name?.toLowerCase() || '')
                        );
                        
                        const selectedAccount = matchingOwnedAccount || businessOwnedAdAccounts[0];
                        adAccountId = selectedAccount.account_id || selectedAccount.id?.replace(/^act_/i, '') || null;
                        
                        if (matchingOwnedAccount) {
                        } else {
                        }
                        foundAdAccounts = true;
                      } else {
                      }
                    } else {
                      const errorText2 = await businessOwnedAdAccountsResponse.text();
                      const errorMessage2 = errorText2.substring(0, 300);
                    }
                  }
                } else {
                }
              }
            } catch (error) {
            }
          }
          } // End of Strategy 1, 2, 3 block (if !adAccountId)
          
          // Fallback: Try /me/adaccounts but filter/search for page-related accounts
          // Only if we haven't found any ad account yet (including from priority strategy and other strategies)
          if (!adAccountId) {
            // If all other strategies failed, try /me/adaccounts but filter/search for page-related accounts
            const userAdAccountsUrl = `https://graph.facebook.com/v24.0/me/adaccounts?access_token=${account.access_token}&fields=id,account_id,name&limit=50`;
            const userAdAccountsResponse = await graphFetch(userAdAccountsUrl);
            
            if (userAdAccountsResponse.ok) {
              const userAdAccountsData = await userAdAccountsResponse.json();
              const userAdAccounts = userAdAccountsData.data || [];
              
              
              if (userAdAccounts.length > 0) {
                // Try to find an ad account that matches the page name or use the first one
                const pageNameLower = pageName.toLowerCase();
                const matchingAccount = userAdAccounts.find((acc: any) => 
                  acc.name?.toLowerCase().includes(pageNameLower) || 
                  acc.name?.toLowerCase().includes('ad account')
                );
                
                if (matchingAccount) {
                  adAccountId = matchingAccount.account_id || matchingAccount.id?.replace(/^act_/i, '') || null;
                } else {
                  // Use the first ad account as fallback
                  adAccountId = userAdAccounts[0].account_id || userAdAccounts[0].id?.replace(/^act_/i, '') || null;
                }
              } else {
              }
            } else {
              // Error logging
              const errorText = await userAdAccountsResponse.text();
              const errorMessage = errorText.substring(0, 300);
            }
          }
        } else {
        }
      } catch (error) {
      }
    } else if (provider === 'instagram') {
      try {
        const account = await prisma.account.findFirst({
          where: {
            userId: session.user.id,
            provider: 'facebook',
          },
          select: {
            access_token: true,
          },
        });

        if (account?.access_token) {
          // Detect this user's own ad account. (A hardcoded developer ad
          // account used to be forced here for every tenant — removed.)

          // Strategy 2: Try to get ad account from connected Facebook Page (if it exists in database)
          if (!adAccountId) {
          let connectedFacebookPageId = facebookPageId;
          
          if (!connectedFacebookPageId) {
              // Get the connected Facebook Page ID from Instagram API
            const instagramAccountUrl = `https://graph.facebook.com/v24.0/${pageId}?fields=id,username,name,connected_facebook_page&access_token=${account.access_token}`;
            const instagramAccountResponse = await graphFetch(instagramAccountUrl);
            
            if (instagramAccountResponse.ok) {
              const instagramAccountData = await instagramAccountResponse.json();
              connectedFacebookPageId = instagramAccountData.connected_facebook_page?.id;
            } else {
              const errorText = await instagramAccountResponse.text();
            }
          }
          
          if (connectedFacebookPageId) {
            
              // Try to find the connected Facebook Page in the database
            const facebookPage = await prisma.connectedPage.findFirst({
              where: {
                userId: session.user.id,
                provider: 'facebook',
                pageId: connectedFacebookPageId,
                disconnectedAt: null,
              },
              select: {
                adAccountId: true,
              },
            });

            // Use the Facebook Page's ad account ID if it's connected and has an ad account
            if (facebookPage?.adAccountId) {
              adAccountId = facebookPage.adAccountId;
              }
            }
          }
          
          // Strategy 3: Fallback - Use /me/adaccounts and get the first available ad account
          if (!adAccountId) {
            const userAdAccountsUrl = `https://graph.facebook.com/v24.0/me/adaccounts?access_token=${account.access_token}&fields=id,account_id,name,business_name&limit=50`;
            const userAdAccountsResponse = await graphFetch(userAdAccountsUrl);
                
            if (userAdAccountsResponse.ok) {
              const userAdAccountsData = await userAdAccountsResponse.json();
              const userAdAccounts = userAdAccountsData.data || [];
                  
              if (userAdAccounts.length > 0) {
                // Try to find an ad account that matches the Instagram page name or use the first one
                const pageNameLower = pageName.toLowerCase();
                const matchingAccount = userAdAccounts.find((acc: any) => 
                  acc.name?.toLowerCase().includes(pageNameLower) || 
                  acc.business_name?.toLowerCase().includes(pageNameLower)
                );
                
                if (matchingAccount) {
                  adAccountId = matchingAccount.account_id || matchingAccount.id?.replace(/^act_/i, '') || null;
                  } else {
                  // Use the first ad account as fallback
                  adAccountId = userAdAccounts[0].account_id || userAdAccounts[0].id?.replace(/^act_/i, '') || null;
                  }
                } else {
                }
            } else {
              const errorText = await userAdAccountsResponse.text();
              }
            }
          } else {
        }
      } catch (error: any) {
      }
    }


    // Block if this page/account is already connected to a DIFFERENT user
    const existingOtherUser = await prisma.connectedPage.findFirst({
      where: {
        pageId,
        provider,
        disconnectedAt: null,
        NOT: { userId: session.user.id },
      },
    });
    if (existingOtherUser) {
      return NextResponse.json(
        { error: 'This profile is already connected to another account. Please disconnect it from there first.' },
        { status: 409 }
      );
    }

    // Store connected page
    try {
      // Check if page already exists to decide whether to update adAccountId
      const existingPage = await prisma.connectedPage.findUnique({
        where: {
          userId_pageId_provider: {
            userId: session.user.id,
            pageId,
            provider,
          },
        },
        select: { adAccountId: true },
      });

      const updateData: any = {
        pageName,
        pageAccessToken: finalPageAccessToken,
        disconnectedAt: null, // Re-connecting restores the page; comments are preserved
        updatedAt: new Date(),
      };

      // Always update adAccountId if we successfully detected one (permissions may have changed, or user wants to refresh it)
      // This allows reconnecting a page to automatically refresh the ad account ID
      if (adAccountId) {
        updateData.adAccountId = adAccountId;
      } else if (existingPage && !existingPage.adAccountId) {
        // Keep existing behavior: only log if page exists but has no ad account ID
      }

      // For Instagram pages, store the Instagram Business Account ID for webhook matching
      if (provider === 'instagram') {
        updateData.instagramUserId = pageId;
      }

      const connectedPage = await prisma.connectedPage.upsert({
        where: {
          userId_pageId_provider: {
            userId: session.user.id,
            pageId,
            provider,
          },
        },
        update: updateData,
        create: {
          userId: session.user.id,
          pageId,
          pageName,
          pageAccessToken: finalPageAccessToken,
          adAccountId,
          instagramUserId: provider === 'instagram' ? pageId : null,
          provider,
        },
      });

      // Clear the cache so fresh data is fetched immediately
      const cacheKey = `pages_${session.user.id}`;
      pagesCache.delete(cacheKey);

      // Subscribe to webhooks for real-time comment delivery
      if (provider === 'instagram') {
        subscribeInstagramToWebhooks(pageId, finalPageAccessToken).catch(() => {});
      } else if (provider === 'facebook') {
        subscribePageToWebhooks(pageId, finalPageAccessToken).catch(() => {});
      }

      // Comments come from webhooks only - no API fetch on connect

      return NextResponse.json({ success: true, page: connectedPage });
    } catch (dbError: any) {
      // Check for unique constraint violation
      if (dbError.code === 'P2002') {
        return NextResponse.json(
          { error: 'Page is already connected' },
          { status: 409 }
        );
      }
      throw dbError; // Re-throw to be caught by outer catch
    }
  } catch (error: any) {
    return NextResponse.json(
      { 
        error: error?.message || 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error?.message : undefined
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      pageId,
      adAccountId,
      provider: providerParam,
      autoReplyEnabled,
      autoModerationEnabled,
      autoHideNegativeEnabled,
      autoNegativeAction,
      customReplyPrompt,
      webSourceUrl,
      webSourceEnabled,
      replyDelaySeconds,
      replyUserCooldownMinutes,
      replyOnlyFirstComment,
      replyMinCommentLength,
      maxReplyLength,
      replyBlocklistKeywords,
      replyAllowlistKeywords,
      replyAllowlistEnabled,
      manualReviewEnabled,
      autoModerateReplies,
    } = body;

    if (!pageId) {
      return NextResponse.json(
        { error: 'Page ID is required' },
        { status: 400 }
      );
    }

    const provider = providerParam || 'facebook';

    // Normalize ad account ID (remove 'act_' prefix if present)
    const normalizedAdAccountId = adAccountId 
      ? String(adAccountId).trim().replace(/^act_/i, '')
      : null;

    // Build update payload
    try {
      const updateData: any = {
        updatedAt: new Date(),
      };

      if (adAccountId !== undefined) {
        updateData.adAccountId = normalizedAdAccountId;
      }
      if (autoReplyEnabled !== undefined) {
        updateData.autoReplyEnabled = Boolean(autoReplyEnabled);
      }
      if (autoModerationEnabled !== undefined) {
        updateData.autoModerationEnabled = Boolean(autoModerationEnabled);
      }
      if (autoHideNegativeEnabled !== undefined) {
        updateData.autoHideNegativeEnabled = Boolean(autoHideNegativeEnabled);
      }
      if (autoNegativeAction !== undefined) {
        const normalized = String(autoNegativeAction) === 'delete' ? 'delete' : 'hide';
        updateData.autoNegativeAction = normalized;
      }
      if (autoModerateReplies !== undefined) {
        updateData.autoModerateReplies = Boolean(autoModerateReplies);
      }
      if (customReplyPrompt !== undefined) {
        updateData.customReplyPrompt = customReplyPrompt === '' || customReplyPrompt === null
          ? null
          : String(customReplyPrompt).trim();
      }
      if (webSourceUrl !== undefined) {
        if (webSourceUrl === '' || webSourceUrl === null) {
          updateData.webSourceUrl = null;
        } else {
          const validated = validateWebSourceUrl(webSourceUrl);
          if (!validated.valid) {
            return NextResponse.json({ error: validated.error }, { status: 400 });
          }
          updateData.webSourceUrl = validated.url;
        }
      }
      if (webSourceEnabled !== undefined) {
        updateData.webSourceEnabled = Boolean(webSourceEnabled);
      }
      if (replyDelaySeconds !== undefined) {
        const numeric = Number(replyDelaySeconds);
        if (Number.isFinite(numeric) && numeric >= 0) {
          const clamped = Math.min(Math.round(numeric), 1800);
          updateData.replyDelaySeconds = clamped;
        } else {
          updateData.replyDelaySeconds = 0;
        }
      }

      if (replyUserCooldownMinutes !== undefined) {
        const numeric = Number(replyUserCooldownMinutes);
        updateData.replyUserCooldownMinutes = Number.isFinite(numeric) && numeric >= 0 ? Math.round(numeric) : 0;
      }
      if (replyOnlyFirstComment !== undefined) {
        updateData.replyOnlyFirstComment = Boolean(replyOnlyFirstComment);
      }
      if (replyMinCommentLength !== undefined) {
        const numeric = Number(replyMinCommentLength);
        updateData.replyMinCommentLength = Number.isFinite(numeric) && numeric >= 1 ? Math.min(Math.round(numeric), 100) : 2;
      }
      if (maxReplyLength !== undefined && maxReplyLength !== null) {
        const numeric = Number(maxReplyLength);
        updateData.maxReplyLength = Number.isFinite(numeric) && numeric >= 1 ? Math.min(Math.round(numeric), 1000) : 1000;
      }
      if (replyBlocklistKeywords !== undefined) {
        const value = replyBlocklistKeywords === '' || replyBlocklistKeywords === null ? null : String(replyBlocklistKeywords);
        if (value !== null && !isValidKeywordList(value)) {
          return NextResponse.json({ error: 'Blocklist keywords must be a JSON array of strings' }, { status: 400 });
        }
        updateData.replyBlocklistKeywords = value;
      }
      if (replyAllowlistKeywords !== undefined) {
        const value = replyAllowlistKeywords === '' || replyAllowlistKeywords === null ? null : String(replyAllowlistKeywords);
        if (value !== null && !isValidKeywordList(value)) {
          return NextResponse.json({ error: 'Allowlist keywords must be a JSON array of strings' }, { status: 400 });
        }
        updateData.replyAllowlistKeywords = value;
      }
      if (replyAllowlistEnabled !== undefined) {
        updateData.replyAllowlistEnabled = Boolean(replyAllowlistEnabled);
      }
      if (manualReviewEnabled !== undefined) {
        updateData.manualReviewEnabled = Boolean(manualReviewEnabled);
      }

      if (updateData.webSourceEnabled === true) {
        let effectiveUrl: string | null;
        if (updateData.webSourceUrl !== undefined) {
          effectiveUrl = (updateData.webSourceUrl === null || updateData.webSourceUrl === '') ? null : String(updateData.webSourceUrl).trim();
        } else {
          const current = await prisma.connectedPage.findUnique({
            where: {
              userId_pageId_provider: {
                userId: session.user.id,
                pageId,
                provider,
              },
            },
            select: { webSourceUrl: true },
          });
          effectiveUrl = current?.webSourceUrl?.trim() ?? null;
        }
        if (!effectiveUrl) {
          return NextResponse.json(
            { error: 'Website URL is required when using website for answers.' },
            { status: 400 }
          );
        }
      }

      const connectedPage = await prisma.connectedPage.update({
        where: {
          userId_pageId_provider: {
            userId: session.user.id,
            pageId,
            provider,
          },
        },
        data: updateData,
        select: {
          id: true,
          pageId: true,
          pageName: true,
          adAccountId: true,
          provider: true,
          autoReplyEnabled: true,
          autoModerationEnabled: true,
          autoHideNegativeEnabled: true,
          autoNegativeAction: true,
          autoModerateReplies: true,
          customReplyPrompt: true,
          webSourceUrl: true,
          webSourceEnabled: true,
          replyDelaySeconds: true,
          replyUserCooldownMinutes: true,
          replyOnlyFirstComment: true,
          replyMinCommentLength: true,
          maxReplyLength: true,
          replyBlocklistKeywords: true,
          replyAllowlistKeywords: true,
          replyAllowlistEnabled: true,
          manualReviewEnabled: true,
        },
      });

      // Clear the cache so fresh data is fetched immediately
      const cacheKey = `pages_${session.user.id}`;
      pagesCache.delete(cacheKey);

      return NextResponse.json({
        success: true,
        page: connectedPage,
        message: 'Page settings updated successfully',
      });
    } catch (dbError: any) {
      if (dbError.code === 'P2025') {
        return NextResponse.json(
          { error: 'Page not found' },
          { status: 404 }
        );
      }
      throw dbError;
    }
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error?.message || 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error?.message : undefined,
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const pageId = searchParams.get('pageId');
    const provider = searchParams.get('provider') || 'facebook';

    if (!pageId) {
      return NextResponse.json(
        { error: 'Page ID is required' },
        { status: 400 }
      );
    }

    // Find the connected page (include soft-deleted for re-disconnect)
    const connectedPage = await prisma.connectedPage.findFirst({
      where: {
        userId: session.user.id,
        pageId,
        provider,
      },
    });

    if (!connectedPage) {
      return NextResponse.json(
        { error: 'Page not found or not connected' },
        { status: 404 }
      );
    }

    // Soft-delete: preserve page and comments for when user re-adds the page
    await prisma.connectedPage.update({
      where: { id: connectedPage.id },
      data: {
        disconnectedAt: new Date(),
        pageAccessToken: '',
      },
    });

    // Clear the cache so fresh data is fetched immediately
    const cacheKey = `pages_${session.user.id}`;
    pagesCache.delete(cacheKey);

    return NextResponse.json({ success: true, message: 'Page disconnected successfully' });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

