import { NextRequest, NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { analyzeCommentSentiment } from '@/lib/openai';
import { generateAIReply, shouldAutoReply, detectCommentLanguage } from '@/lib/aiReplyEngine';

const { auth } = NextAuth(authOptions);

export const dynamic = 'force-dynamic';

// Helper function to fetch ads and their comments
async function fetchAdsComments(
  connectedPageId: string,
  adAccountId: string,
  pageAccessToken: string,
  fetchSince: Date | null,
  userId: string,
  isInstagram: boolean
): Promise<{ newCommentsCount: number; totalCommentsFetched: number }> {
  let newCommentsCount = 0;
  let totalCommentsFetched = 0;
  const platform = isInstagram ? 'Instagram' : 'Facebook';

  try {
    // Get connected page info for better logging
    const connectedPage = await prisma.connectedPage.findUnique({
      where: { id: connectedPageId },
      select: { pageName: true, pageId: true, provider: true },
    });
    
    const pageInfo = connectedPage ? `${connectedPage.pageName} (${connectedPage.pageId})` : connectedPageId;
    console.log(`🔍 [${platform} Ad Comments] Starting fetch for Page: ${pageInfo} | Ad Account: ${adAccountId || 'NOT SET'}`);
    
    if (!adAccountId) {
      console.log(`⚠️  [${platform} Ad Comments] No ad account ID configured for this page. Please set an ad account ID in the Pages settings.`);
      return { newCommentsCount, totalCommentsFetched };
    }

    // Marketing API (ads list) generally requires a USER access token with ads_read.
    const account = await prisma.account.findFirst({
      where: {
        userId,
        provider: 'facebook',
      },
      select: {
        access_token: true,
      },
    });

    const marketingAccessToken = account?.access_token;
    if (!marketingAccessToken) {
      console.log(`⚠️  [${platform} Ad Comments] No marketing access token found - skipping ad comments`);
      return { newCommentsCount, totalCommentsFetched };
    }
    
    // Normalize ad account id (people often paste "act_123...", while our code adds "act_" itself)
    const normalizedAdAccountId = String(adAccountId || '').trim().replace(/^act_/i, '');
    if (!normalizedAdAccountId) {
      console.log(`⚠️  [${platform} Ad Comments] Invalid ad account ID - skipping ad comments`);
      return { newCommentsCount, totalCommentsFetched };
    }


    // Fetch ads from the ad account
    // Ads comments are comments on the post/media behind the ad.
    // Facebook: creative.effective_object_story_id (fallback: creative.object_story_id) => /{post_id}/comments
    // Instagram: effective_instagram_media_id (Marketing API) => /{ig_media_id}/comments
    // IMPORTANT: For Instagram ads, check both ad-level and creative-level effective_instagram_media_id
    // Some ad types have it in the creative object
    const adsFields = isInstagram
      ? 'id,name,effective_instagram_media_id,instagram_actor_id,creative{effective_instagram_media_id,object_story_spec,instagram_actor_id},status,effective_status,permalink_url'
      : 'id,name,creative{effective_object_story_id,object_story_id},status,effective_status,permalink_url';

    // First, fetch ALL ads to see what we have (for debugging)
    const allAdsUrl = `https://graph.facebook.com/v24.0/act_${normalizedAdAccountId}/ads?access_token=${marketingAccessToken}&fields=${encodeURIComponent(adsFields)}&limit=100`;
    const allAdsResponse = await fetch(allAdsUrl);
    
    if (!allAdsResponse.ok) {
      const errorText = await allAdsResponse.text();
      console.log(`❌ [${platform} Ad Comments] Failed to fetch ads: ${errorText.substring(0, 200)}`);
      return { newCommentsCount, totalCommentsFetched };
    }
    
    const allAdsData = await allAdsResponse.json();
    const allAds = allAdsData.data || [];
    
    // Log all ads with their statuses and dark ad detection
    if (allAds.length > 0) {
      console.log(`📊 [${platform} Ads] Ad Account: act_${normalizedAdAccountId} | Found ${allAds.length} total ads`);
      
      // For Instagram, check which ads are dark ads (not in profile)
      let darkAdsCount = 0;
      let adsWithMediaId = 0;
      
      allAds.forEach((ad: any) => {
        const permalink = ad.permalink_url || 'N/A';
        // Check both ad-level and creative-level for media ID
        const hasMediaId = isInstagram ? !!(ad.effective_instagram_media_id || ad.creative?.effective_instagram_media_id) : true;
        const mediaId = isInstagram ? (ad.effective_instagram_media_id || ad.creative?.effective_instagram_media_id) : null;
        const isDarkAd = isInstagram && hasMediaId && (!permalink || permalink === 'N/A' || !permalink.includes('instagram.com/p/'));
        
        if (isInstagram) {
          if (hasMediaId) {
            adsWithMediaId++;
            const mediaIdSource = ad.effective_instagram_media_id ? 'ad-level' : 'creative-level';
            if (isDarkAd) {
              darkAdsCount++;
              console.log(`   🌑 DARK AD - Ad ID: ${ad.id} | Name: ${ad.name || 'N/A'} | Status: ${ad.status || 'N/A'} | Effective Status: ${ad.effective_status || 'N/A'} | IG Media ID: ${mediaId} (${mediaIdSource}) | Permalink: ${permalink}`);
            } else {
              console.log(`   📱 PROFILE AD - Ad ID: ${ad.id} | Name: ${ad.name || 'N/A'} | Status: ${ad.status || 'N/A'} | Effective Status: ${ad.effective_status || 'N/A'} | IG Media ID: ${mediaId} (${mediaIdSource}) | Permalink: ${permalink}`);
            }
          } else {
            // Log more details for ads without media ID
            const hasCreative = !!ad.creative;
            const hasObjectStorySpec = !!ad.creative?.object_story_spec;
            console.log(`   ⚠️  NO MEDIA ID - Ad ID: ${ad.id} | Name: ${ad.name || 'N/A'} | Status: ${ad.status || 'N/A'} | Effective Status: ${ad.effective_status || 'N/A'} | Permalink: ${permalink}`);
            console.log(`      [Debug] Has creative: ${hasCreative} | Has object_story_spec: ${hasObjectStorySpec}`);
            if (hasObjectStorySpec) {
              console.log(`      [Debug] object_story_spec keys:`, Object.keys(ad.creative.object_story_spec || {}));
            }
          }
        } else {
          console.log(`   - Ad ID: ${ad.id} | Name: ${ad.name || 'N/A'} | Status: ${ad.status || 'N/A'} | Effective Status: ${ad.effective_status || 'N/A'} | Link: ${permalink}`);
        }
      });
      
      if (isInstagram) {
        console.log(`📱 [Instagram Ads Summary] Total: ${allAds.length} | With Media ID: ${adsWithMediaId} | Dark Ads (not in profile): ${darkAdsCount} | Profile Ads: ${adsWithMediaId - darkAdsCount}`);
      }
      
      // Filter for only ACTIVE ads
      const ads = allAds.filter((ad: any) => ad.effective_status === 'ACTIVE');
      const activeDarkAds = isInstagram ? ads.filter((ad: any) => {
        const hasMediaId = !!ad.effective_instagram_media_id;
        const permalink = ad.permalink_url || 'N/A';
        return hasMediaId && (!permalink || permalink === 'N/A' || !permalink.includes('instagram.com/p/'));
      }).length : 0;
      
      console.log(`📢 [${platform} Ads] Ad Account: act_${normalizedAdAccountId} | Found ${ads.length} ACTIVE ads (filtered from ${allAds.length} total)${isInstagram ? ` | Active Dark Ads: ${activeDarkAds}` : ''}`);
      
      if (ads.length === 0 && allAds.length > 0) {
        const statusCounts: Record<string, number> = {};
        allAds.forEach((ad: any) => {
          const status = ad.effective_status || 'UNKNOWN';
          statusCounts[status] = (statusCounts[status] || 0) + 1;
        });
        console.log(`⚠️  [${platform} Ads] Ad Account: act_${normalizedAdAccountId} | No ACTIVE ads found. Status breakdown:`, statusCounts);
      }
    } else {
      console.log(`ℹ️  [${platform} Ads] Ad Account: act_${normalizedAdAccountId} | No ads found at all`);
    }
    
    // Filter for only ACTIVE ads
    const ads = allAds.filter((ad: any) => ad.effective_status === 'ACTIVE');
    
    // Process ads in batches
    const batchSize = 5;
    for (let i = 0; i < ads.length; i += batchSize) {
      const batch = ads.slice(i, i + batchSize);
      
      const commentFetchPromises = batch.map(async (ad: any) => {
        try {
          let targetIds: string[] = [];

          if (isInstagram) {
            // IMPORTANT: For Instagram ads with multiple creatives, we need to fetch ALL media IDs
            // Multi-creative ads (Advantage+ creative, carousel, etc.) can have multiple media IDs
            
            // Method 1: Check ad-level effective_instagram_media_id
            if (ad.effective_instagram_media_id) {
              targetIds.push(ad.effective_instagram_media_id);
            }
            
            // Method 2: Check creative-level effective_instagram_media_id
            if (ad.creative?.effective_instagram_media_id && 
                !targetIds.includes(ad.creative.effective_instagram_media_id)) {
              targetIds.push(ad.creative.effective_instagram_media_id);
            }
            
            // Method 3: For Advantage+ Creative, fetch recent media from Instagram account
            // Advantage+ ads create multiple media posts but API only exposes one media ID
            // We'll search the IG account's recent media for posts matching this ad
            if (connectedPage?.pageId && pageAccessToken) {
              try {
                const sinceTime = ad.created_time || ad.updated_time;
                const sinceTimestamp = sinceTime ? `&since=${Math.floor(new Date(sinceTime).getTime() / 1000) - 86400}` : ''; // 24h before ad
                
                const igMediaUrl = `https://graph.facebook.com/v24.0/${connectedPage.pageId}/media?access_token=${pageAccessToken}&fields=id,media_type,timestamp,caption&limit=50${sinceTimestamp}`;
                console.log(`🔍 [Instagram Ad Comments] Ad ID: ${ad.id} | Fetching recent Instagram media to find ad variations`);
                
                const igMediaResponse = await fetch(igMediaUrl);
                if (igMediaResponse.ok) {
                  const igMediaData = await igMediaResponse.json();
                  const recentMedia = igMediaData.data || [];
                  
                  console.log(`📱 [Instagram Ad Comments] Ad ID: ${ad.id} | Found ${recentMedia.length} recent Instagram media posts`);
                  
                  // For each recent media, check if it might be from this ad
                  // Match by: similar timestamp, image type, matching caption
                  for (const media of recentMedia) {
                    if (!targetIds.includes(media.id) && media.media_type === 'IMAGE') {
                      // Check if caption matches (if available from creative)
                      const adMessage = ad.creative?.object_story_spec?.link_data?.message;
                      const mediaCaption = media.caption || '';
                      
                      if (adMessage && mediaCaption.includes(adMessage.substring(0, 20))) {
                        targetIds.push(media.id);
                        console.log(`✅ [Instagram Ad Comments] Ad ID: ${ad.id} | Found potential ad variation via IG media: ${media.id}`);
                      }
                    }
                  }
                }
              } catch (igMediaError: any) {
                console.log(`⚠️  [Instagram Ad Comments] Ad ID: ${ad.id} | Could not fetch IG media: ${igMediaError?.message}`);
              }
            }
            
            // Method 4: Fetch all ad creatives to get multiple media IDs (for non-Advantage+ ads)
            if (ad.id && marketingAccessToken) {
              try {
                const creativesUrl = `https://graph.facebook.com/v24.0/${ad.id}/adcreatives?access_token=${marketingAccessToken}&fields=effective_instagram_media_id,instagram_actor_id,object_story_spec,asset_feed_spec&limit=50`;
                const creativesResponse = await fetch(creativesUrl);
                
                if (creativesResponse.ok) {
                  const creativesData = await creativesResponse.json();
                  const creatives = creativesData.data || [];
                  
                  console.log(`🔍 [Instagram Ad Comments] Ad ID: ${ad.id} | DEBUG: Fetched ${creatives.length} creative(s) from API`);
                  console.log(`   📋 [Debug] Creatives response:`, JSON.stringify(creativesData, null, 2).substring(0, 2000));
                  
                  if (creatives.length > 1) {
                    console.log(`🎨 [Instagram Ad Comments] Ad ID: ${ad.id} | Found ${creatives.length} creative variations`);
                  }
                  
                  creatives.forEach((creative: any, index: number) => {
                    console.log(`   📋 [Debug] Creative ${index + 1}:`, JSON.stringify(creative, null, 2).substring(0, 1000));
                    
                    // Method 3a: Direct effective_instagram_media_id
                    if (creative.effective_instagram_media_id && 
                        !targetIds.includes(creative.effective_instagram_media_id)) {
                      targetIds.push(creative.effective_instagram_media_id);
                      console.log(`✅ [Instagram Ad Comments] Ad ID: ${ad.id} | Added media ID from creative ${index + 1}: ${creative.effective_instagram_media_id}`);
                    }
                    
                    // Method 3b: Check asset_feed_spec for Advantage+ creative variations
                    if (creative.asset_feed_spec?.videos) {
                      creative.asset_feed_spec.videos.forEach((video: any) => {
                        if (video.video_id && !targetIds.includes(video.video_id)) {
                          targetIds.push(video.video_id);
                          console.log(`✅ [Instagram Ad Comments] Ad ID: ${ad.id} | Added video media ID from asset_feed_spec: ${video.video_id}`);
                        }
                      });
                    }
                    
                    if (creative.asset_feed_spec?.images) {
                      creative.asset_feed_spec.images.forEach((image: any) => {
                        if (image.hash && !targetIds.includes(image.hash)) {
                          console.log(`ℹ️  [Instagram Ad Comments] Ad ID: ${ad.id} | Found image hash in asset_feed_spec: ${image.hash} (need to convert to media ID)`);
                        }
                      });
                    }
                    
                    // Method 3c: Check object_story_spec for carousel child attachments
                    if (creative.object_story_spec?.link_data?.child_attachments) {
                      creative.object_story_spec.link_data.child_attachments.forEach((attachment: any, attachIndex: number) => {
                        if (attachment.instagram_media_id && !targetIds.includes(attachment.instagram_media_id)) {
                          targetIds.push(attachment.instagram_media_id);
                          console.log(`✅ [Instagram Ad Comments] Ad ID: ${ad.id} | Added media ID from carousel attachment ${attachIndex + 1}: ${attachment.instagram_media_id}`);
                        }
                      });
                    }
                  });
                } else {
                  const errorText = await creativesResponse.text();
                  console.log(`⚠️  [Instagram Ad Comments] Ad ID: ${ad.id} | Failed to fetch creatives: ${errorText.substring(0, 300)}`);
                }
              } catch (creativesError: any) {
                console.log(`⚠️  [Instagram Ad Comments] Ad ID: ${ad.id} | Could not fetch ad creatives: ${creativesError?.message}`);
              }
            }
            
            
            // If no media IDs found, skip this ad
            if (targetIds.length === 0) {
              console.log(`⚠️  [Instagram Ad Comments] Ad ID: ${ad.id} | Name: ${ad.name || 'N/A'} | No effective_instagram_media_id found - skipping`);
              return { ad, comments: [], error: null };
            }
            
            // Log how many media IDs we're processing
            if (targetIds.length > 1) {
              console.log(`🎨 [Instagram Ad Comments] Ad ID: ${ad.id} | Processing ${targetIds.length} creative variations with media IDs: ${targetIds.join(', ')}`);
            }
            
            // Legacy variable for compatibility with code below that expects single targetId
            let targetId: string | undefined = targetIds[0];
            
            // Check if this is a dark ad (not in profile)
            const permalink = ad.permalink_url || '';
            const isDarkAd = !permalink || !permalink.includes('instagram.com/p/');
            const adType = isDarkAd ? '🌑 DARK AD' : '📱 PROFILE AD';
            
            // Check which Instagram account this ad belongs to (ad-level check)
            let adInstagramActorId = ad.instagram_actor_id || ad.creative?.instagram_actor_id || ad.creative?.object_story_spec?.instagram_actor_id;
            
            // If not found at ad level, try fetching the first media's owner to determine ad ownership
            if (!adInstagramActorId && targetIds[0]) {
              console.log(`🔍 [Instagram Ad Comments] Ad ID: ${ad.id} | Attempting to fetch first media ${targetIds[0]} to determine ad owner`);
              
              try {
                const mediaUrl = `https://graph.facebook.com/v24.0/${targetIds[0]}?access_token=${pageAccessToken}&fields=id,owner`;
                const mediaResponse = await fetch(mediaUrl);
                
                if (mediaResponse.ok) {
                  const mediaData = await mediaResponse.json();
                  const mediaOwnerId = mediaData.owner?.id || mediaData.owner || null;

                  if (mediaOwnerId) {
                    adInstagramActorId = mediaOwnerId;
                    console.log(`✅ [Instagram Ad Comments] Ad ID: ${ad.id} | Found Instagram account via media owner: ${adInstagramActorId}`);
                  }
                }
              } catch (error: any) {
                console.log(`⚠️  [Instagram Ad Comments] Ad ID: ${ad.id} | Error fetching media owner: ${error?.message}`);
              }
            }
            
            // Verify ad ownership matches current Instagram page
            if (adInstagramActorId && connectedPage?.pageId) {
              if (adInstagramActorId !== connectedPage.pageId) {
                console.log(`⏭️  [Instagram Ad Comments] Ad ID: ${ad.id} | Ad belongs to different Instagram account (${adInstagramActorId} vs ${connectedPage.pageId}) - skipping`);
                return { ad, comments: [], error: null };
              } else {
                console.log(`✅ [Instagram Ad Comments] Ad ID: ${ad.id} | Verified ad belongs to Instagram account ${connectedPage.pageId}`);
              }
            } else {
              // No ownership check possible (missing actor ID or page ID)
            }
            
            console.log(`📱 [Instagram Ad Comments] ${adType} | Ad ID: ${ad.id} | Name: ${ad.name || 'N/A'} | Processing ${targetIds.length} media ID(s) | IG Actor ID: ${adInstagramActorId || 'N/A'}`);
            
            // Collect all comments from all media IDs in this ad
            let allCommentsForAd: any[] = [];
            
            // Loop through each media ID and fetch its comments
            for (let mediaIndex = 0; mediaIndex < targetIds.length; mediaIndex++) {
              const targetId = targetIds[mediaIndex];
              const mediaLabel = targetIds.length > 1 ? ` (Creative ${mediaIndex + 1}/${targetIds.length})` : '';
              
              console.log(`📱 [Instagram Ad Comments] Ad ID: ${ad.id} | Processing Media ID: ${targetId}${mediaLabel}`);
              
              try {
                // Fetch comments for this media
                const commentFields = 'id,text,username,timestamp';
                let commentsUrl = `https://graph.facebook.com/v24.0/${targetId}/comments?access_token=${pageAccessToken}&fields=${commentFields}&limit=50`;
                
                if (fetchSince) {
                  const sinceTimestamp = Math.floor(fetchSince.getTime() / 1000);
                  commentsUrl += `&since=${sinceTimestamp}`;
                }
                
                let commentsResponse = await fetch(commentsUrl);
                let retriedWithUserToken = false;
                
                // If page token fails, check if it's a permission error
                if (!commentsResponse.ok) {
                  const errorText = await commentsResponse.text();
                  let errorData: any = {};
                  try {
                    errorData = JSON.parse(errorText);
                  } catch (e) {
                    // Not JSON
                  }
                  
                  const errorCode = errorData.error?.code;
                  const errorType = errorData.error?.type;
                  const isOAuthError = errorCode === 200 || errorCode === 190 || errorType === 'OAuthException';
                  const isPermissionError = errorCode === 10;
                  
                  // If it's a permission error (code 10), skip this media (doesn't belong to this page)
                  if (isPermissionError) {
                    console.log(`⏭️  [Instagram Ad Comments] Ad ID: ${ad.id} | Media ID: ${targetId}${mediaLabel} doesn't belong to this Instagram account (code 10) - skipping media`);
                    continue; // Skip to next media ID
                  }
                  
                  // Retry with user token for OAuth errors
                  if (isOAuthError && marketingAccessToken && !retriedWithUserToken && !isPermissionError) {
                    retriedWithUserToken = true;
                    console.log(`🔄 [Instagram Ad Comments] Ad ID: ${ad.id} | Media ${targetId}${mediaLabel} - Retrying with user token`);
                    
                    commentsUrl = `https://graph.facebook.com/v24.0/${targetId}/comments?access_token=${marketingAccessToken}&fields=${commentFields}&limit=50`;
                    if (fetchSince) {
                      const sinceTimestamp = Math.floor(fetchSince.getTime() / 1000);
                      commentsUrl += `&since=${sinceTimestamp}`;
                    }
                    
                    commentsResponse = await fetch(commentsUrl);
                    
                    if (!commentsResponse.ok) {
                      console.log(`❌ [Instagram Ad Comments] Ad ID: ${ad.id} | Media ${targetId}${mediaLabel} - Failed after retry - skipping media`);
                      continue; // Skip to next media ID
                    }
                  } else {
                    console.log(`❌ [Instagram Ad Comments] Ad ID: ${ad.id} | Media ${targetId}${mediaLabel} - Error: ${errorText.substring(0, 150)} - skipping media`);
                    continue; // Skip to next media ID
                  }
                }
                
                // Fetch all comments with pagination
                let mediaComments: any[] = [];
                let nextUrl: string | null = null;
                let pageCount = 0;
                
                do {
                  if (nextUrl) {
                    commentsResponse = await fetch(nextUrl);
                    if (!commentsResponse.ok) {
                      break;
                    }
                  }
                  
                  const commentsData = await commentsResponse.json();
                  const pageComments = commentsData.data || [];
                  
                  // Tag each comment with its media ID
                  pageComments.forEach((comment: any) => {
                    comment._mediaId = targetId; // Store which media this comment came from
                  });
                  
                  mediaComments = [...mediaComments, ...pageComments];
                  pageCount++;
                  
                  nextUrl = commentsData.paging?.next || null;
                  
                  if (nextUrl && pageComments.length > 0) {
                    console.log(`📄 [Instagram Ad Comments] Ad ID: ${ad.id} | Media ${targetId}${mediaLabel} - Page ${pageCount}: ${pageComments.length} comments`);
                  }
                } while (nextUrl);
                
                if (mediaComments.length > 0) {
                  console.log(`✅ [Instagram Ad Comments] Ad ID: ${ad.id} | Media ${targetId}${mediaLabel} - Found ${mediaComments.length} comment(s)`);
                  allCommentsForAd = [...allCommentsForAd, ...mediaComments];
                } else {
                  console.log(`ℹ️  [Instagram Ad Comments] Ad ID: ${ad.id} | Media ${targetId}${mediaLabel} - No comments found`);
                }
              } catch (mediaError: any) {
                console.log(`❌ [Instagram Ad Comments] Ad ID: ${ad.id} | Media ${targetId}${mediaLabel} - Error: ${mediaError?.message}`);
                // Continue to next media ID
              }
            } // End of media loop for Instagram
            
            if (allCommentsForAd.length > 0) {
              console.log(`📊 [Instagram Ad Comments] Ad ID: ${ad.id} | Total: ${allCommentsForAd.length} comment(s) from ${targetIds.length} media ID(s)`);
            }
            
            return { ad, comments: allCommentsForAd, error: null };
            
          } else {
            // Facebook ads - single targetId
            let targetId = ad.creative?.effective_object_story_id || ad.creative?.object_story_id;
            if (!targetId) {
              return { ad, comments: [], error: null };
            }
            
            // Fetch comments for Facebook ad (same logic as before)
            const commentFields = 'id,message,from,created_time';
            let commentsUrl = `https://graph.facebook.com/v24.0/${targetId}/comments?access_token=${pageAccessToken}&fields=${commentFields}&limit=50`;
            
            if (fetchSince) {
              const sinceTimestamp = Math.floor(fetchSince.getTime() / 1000);
              commentsUrl += `&since=${sinceTimestamp}`;
            }
            
            let commentsResponse = await fetch(commentsUrl);
            
            if (!commentsResponse.ok) {
              const errorText = await commentsResponse.text();
              console.log(`❌ [Facebook Ad Comments] Ad ID: ${ad.id} | Failed to fetch comments: ${errorText.substring(0, 200)}`);
              return { ad, comments: [], error: errorText };
            }
            
            // Fetch all comments with pagination
            let allComments: any[] = [];
            let nextUrl: string | null = null;
            let pageCount = 0;
            
            do {
              if (nextUrl) {
                commentsResponse = await fetch(nextUrl);
                if (!commentsResponse.ok) {
                  break;
                }
              }
              
              const commentsData = await commentsResponse.json();
              const pageComments = commentsData.data || [];
              allComments = [...allComments, ...pageComments];
              pageCount++;
              
              nextUrl = commentsData.paging?.next || null;
              
              if (nextUrl && pageComments.length > 0) {
                console.log(`📄 [Facebook Ad Comments] Ad ID: ${ad.id} | Page ${pageCount}: ${pageComments.length} comments`);
              }
            } while (nextUrl);
            
            if (allComments.length > 0) {
              console.log(`✅ [Facebook Ad Comments] Ad ID: ${ad.id} | Found ${allComments.length} comment(s)`);
            }
            
            return { ad, comments: allComments, error: null };
          }
        } catch (error) {
          return { ad, comments: [], error };
        }
      });
      
      const batchResults = await Promise.all(commentFetchPromises);
      
      // Process comments from ads
      for (const { ad, comments, error } of batchResults) {
        if (error) {
          console.log(`⚠️  [${platform} Ad Comments] Error fetching comments for Ad ID ${ad.id}: ${error}`);
          continue;
        }
        
        totalCommentsFetched += comments.length;
        
        if (comments.length > 0) {
          const adType = isInstagram && (!ad.permalink_url || !ad.permalink_url.includes('instagram.com/p/')) ? '🌑 DARK AD' : '';
          // Count unique media IDs in comments (for multi-creative ads)
          const uniqueMediaIds = isInstagram ? new Set(comments.map((c: any) => c._mediaId).filter(Boolean)).size : 0;
          const mediaInfo = uniqueMediaIds > 1 ? ` from ${uniqueMediaIds} creatives` : '';
          console.log(`📝 [${platform} Ad Comments] ${adType} Ad ID: ${ad.id} | Name: ${ad.name || 'N/A'} | Found ${comments.length} comment(s)${mediaInfo}`);
        }
        
        for (const comment of comments) {
          // Instagram and Facebook have different field names
          let commentCreatedAt: Date;
          let commentMessage: string;
          let authorName: string;
          let authorId: string;

          if (isInstagram) {
            commentCreatedAt = new Date(comment.timestamp);
            commentMessage = comment.text || '';
            authorName = comment.username || 'Unknown';
            // Instagram comments don't provide authorId in the API response - leave null
            authorId = null as any;
          } else {
            commentCreatedAt = new Date(comment.created_time);
            commentMessage = comment.message || '';
            authorName = comment.from?.name || 'Unknown';
            authorId = comment.from?.id || '';
          }
          
          // Always save comments (they might not be in database yet), but only count as "new" if they're recent
          // Check if comment is new (created after fetchSince) or if it doesn't exist in database yet
          const isNewComment = !fetchSince || commentCreatedAt > fetchSince;
          
          // Always save/update the comment, but only count as "new" if it's actually new
          // For Instagram: use the specific media ID this comment came from (for multi-creative ads)
          // We tagged each comment with _mediaId when fetching from multiple media IDs
          const postId = isInstagram
            ? (comment._mediaId || ad.effective_instagram_media_id || ad.creative?.effective_instagram_media_id || '')
            : (ad.creative?.effective_object_story_id || ad.creative?.object_story_id || '');
          
          // Determine source
          const source = isInstagram ? 'instagram_ad' : 'facebook_ad';
          
          const savedComment = await prisma.comment.upsert({
            where: {
              pageId_commentId: {
                pageId: connectedPageId,
                commentId: comment.id,
              },
            },
            update: {
              message: commentMessage,
              authorName: authorName,
              authorId: authorId,
              isFromAd: true,
              adId: ad.id,
              adName: ad.name,
              adAccountId: normalizedAdAccountId as any,
              source: source as any,
            },
            create: {
              pageId: connectedPageId,
              commentId: comment.id,
              postId: postId,
              message: commentMessage,
              authorName: authorName,
              authorId: authorId,
              createdAt: commentCreatedAt,
              isFromAd: true,
              adId: ad.id,
              adName: ad.name,
              adAccountId: normalizedAdAccountId as any,
              source: source as any,
            },
          });
          
          // Log ad comment fetch
          const platform = isInstagram ? 'Instagram' : 'Facebook';
          const mediaId = postId || 'N/A';
          const commentPreview = commentMessage.substring(0, 100) + (commentMessage.length > 100 ? '...' : '');
          
          // Construct ad link
          let adLink: string;
          if (ad.permalink_url) {
            adLink = ad.permalink_url;
          } else if (isInstagram && mediaId && mediaId !== 'N/A') {
            // Instagram media link format
            adLink = `https://www.instagram.com/p/${mediaId}/`;
          } else if (!isInstagram && mediaId && mediaId !== 'N/A') {
            // Facebook post link format: pageId_postId
            const parts = mediaId.split('_');
            if (parts.length === 2) {
              adLink = `https://www.facebook.com/${parts[0]}/posts/${parts[1]}`;
            } else {
              adLink = `https://www.facebook.com/ads/library/?id=${ad.id}`;
            }
          } else {
            // Fallback to Ad Library link
            adLink = `https://www.facebook.com/ads/library/?id=${ad.id}`;
          }
          
          // Detect if this was a new record: fetchedAt is set by @default(now()) on create, never updated
          const wasNewRecord = savedComment.fetchedAt.getTime() > Date.now() - 5000;
          const commentStatus = wasNewRecord ? 'created' : (isNewComment ? 'updated (new)' : 'updated (existing)');
          console.log(`📢 [${platform} Ad Comment] Ad Account: act_${normalizedAdAccountId} | Ad ID: ${ad.id} | Media/Post ID: ${mediaId} | Ad Link: ${adLink} | ${authorName}: ${commentPreview} | Source: ${source} | Status: ${commentStatus}`);
          
          // Analyze sentiment if not already set
          if (!savedComment.sentiment) {
            const sentiment = await analyzeCommentSentiment(commentMessage);
            if (sentiment) {
              await prisma.comment.update({
                where: { id: savedComment.id },
                data: { sentiment },
              });
              
              // Process auto-reply if enabled (non-blocking)
              processAutoReplyForComment(
                savedComment.id,
                sentiment,
                commentMessage,
                authorName,
                connectedPage,
                mediaId,
                isInstagram,
                savedComment.commentId
              ).catch(err => console.error('[Auto-reply] Background error:', err));
            }
          }
          
          // Only count as "new" if it's actually a new comment (not in database before) or if it's recent
          if (wasNewRecord || isNewComment) {
            newCommentsCount++;
          }
        }
      }
    }
    
    if (totalCommentsFetched > 0) {
      console.log(`✅ [${platform} Ad Comments] Completed: ${newCommentsCount} new comments saved, ${totalCommentsFetched} total comments fetched`);
      if (isInstagram) {
        // Count dark ads that had comments
        const darkAdsWithComments = ads.filter((ad: any) => {
          const hasMediaId = !!ad.effective_instagram_media_id;
          const permalink = ad.permalink_url || '';
          return hasMediaId && (!permalink || !permalink.includes('instagram.com/p/'));
        }).length;
        if (darkAdsWithComments > 0) {
          console.log(`🌑 [Instagram Dark Ads] Processed ${darkAdsWithComments} dark ad(s) with comments`);
        }
      }
    } else {
      console.log(`ℹ️  [${platform} Ad Comments] No comments found in ads`);
    }
  } catch (error) {
    console.error(`❌ [${platform} Ad Comments] Error:`, error);
  }
  
  return { newCommentsCount, totalCommentsFetched };
}

/**
 * Generate AI reply and optionally post it (for comments fetch API)
 * Similar to webhook auto-reply but used during manual fetch
 */
async function processAutoReplyForComment(
  commentDbId: string,
  sentiment: string,
  commentText: string,
  authorName: string,
  connectedPage: any,
  postId: string,
  isInstagram: boolean,
  externalCommentId: string
) {
  try {
    console.log(`\n🚀 [Auto-reply API] === STARTING AUTO-REPLY ===`);
    console.log(`   Comment DB ID: ${commentDbId}`);
    console.log(`   Sentiment: ${sentiment}`);
    console.log(`   Comment: "${commentText.substring(0, 50)}${commentText.length > 50 ? '...' : ''}"`);
    console.log(`   Author: ${authorName}`);
    console.log(`   Platform: ${isInstagram ? 'Instagram' : 'Facebook'}`);
    console.log(`   Page: ${connectedPage.pageName}`);
    
    // Check if we should auto-reply
    console.log(`   Checking eligibility...`);
    const shouldReply = shouldAutoReply(sentiment, {
      autoReplyEnabled: connectedPage.autoReplyEnabled,
      autoReplyPositive: connectedPage.autoReplyPositive,
      autoReplyNeutral: connectedPage.autoReplyNeutral,
    });
    
    console.log(`   Should reply: ${shouldReply}`);
    console.log(`   - autoReplyEnabled: ${connectedPage.autoReplyEnabled}`);
    console.log(`   - autoReplyPositive: ${connectedPage.autoReplyPositive}`);
    console.log(`   - autoReplyNeutral: ${connectedPage.autoReplyNeutral}`);
    console.log(`   - sentiment: ${sentiment}`);
    
    if (!shouldReply) {
      console.log(`   ⏭️  Skipping (conditions not met)\n`);
      return;
    }
    
    console.log(`   ✅ Proceeding with auto-reply...`);
    
    // Fetch post/media caption for context (optional)
    let postCaption: string | undefined;
    if (connectedPage.pageAccessToken) {
      console.log(`   🔍 Fetching post caption...`);
      try {
        const postRes = await fetch(
          `https://graph.facebook.com/v24.0/${postId}?access_token=${connectedPage.pageAccessToken}&fields=${isInstagram ? 'caption' : 'message'}`
        );
        if (postRes.ok) {
          const postData = await postRes.json();
          postCaption = isInstagram ? postData.caption : postData.message;
          console.log(`   ✅ Caption fetched`);
        } else {
          console.log(`   ⚠️  Caption fetch failed (${postRes.status})`);
        }
      } catch (err: any) {
        console.log(`   ⚠️  Caption fetch error: ${err?.message}`);
      }
    }
    
    // Detect language if set to auto
    let language = connectedPage.replyLanguage || 'auto';
    if (language === 'auto') {
      const detectedLang = detectCommentLanguage(commentText);
      console.log(`   🌍 Language detected: ${detectedLang}`);
      language = detectedLang;
    } else {
      console.log(`   🌍 Language forced: ${language}`);
    }
    
    // Generate AI reply
    console.log(`   🤖 Calling AI generation...`);
    const aiResult = await generateAIReply({
      brandTone: connectedPage.brandTone || 'professional',
      emojisEnabled: connectedPage.emojisEnabled ?? true,
      ctaText: connectedPage.ctaText || undefined,
      language: language,
      maxLength: connectedPage.maxReplyLength || 100,
      commentText: commentText,
      authorName: authorName,
      sentiment: sentiment as 'positive' | 'neutral',
      postCaption: postCaption,
      customReplyPrompt: connectedPage.customReplyPrompt ?? undefined,
      webSourceUrl: connectedPage.webSourceUrl ?? undefined,
      webSourceEnabled: connectedPage.webSourceEnabled ?? false,
    });
    
    console.log(`   🎯 AI result: ${aiResult.success ? 'SUCCESS' : 'FAILED'}`);
    if (aiResult.reply) {
      console.log(`   💬 Reply: "${aiResult.reply}"`);
    }
    if (aiResult.error) {
      console.log(`   ❌ Error: ${aiResult.error}`);
    }
    
    if (!aiResult.success || !aiResult.reply) {
      console.error(`   ❌ AI generation failed`);
      await prisma.comment.update({
        where: { id: commentDbId },
        data: {
          status: 'ai_failed',
          aiError: aiResult.error,
          aiPromptVersion: aiResult.promptVersion,
          aiModel: aiResult.model,
        },
      });
      console.log(`   === AUTO-REPLY FAILED ===\n`);
      return;
    }
    
    // Store AI-generated reply
    console.log(`   💾 Storing in database...`);
    await prisma.comment.update({
      where: { id: commentDbId },
      data: {
        aiGeneratedReply: aiResult.reply,
        aiPromptVersion: aiResult.promptVersion,
        aiModel: aiResult.model,
        aiConfidence: aiResult.confidence,
        aiGeneratedAt: new Date(),
        status: 'ai_generated',
      },
    });
    console.log(`   ✅ Stored`);
    
    // Check for delayed reply (cron job will post it later)
    const delaySeconds = typeof connectedPage.replyDelaySeconds === 'number'
      ? connectedPage.replyDelaySeconds
      : 0;
    if (delaySeconds > 0) {
      await prisma.comment.update({
        where: { id: commentDbId },
        data: { scheduledPostAt: new Date(Date.now() + delaySeconds * 1000) },
      });
      console.log(`   ⏱ Reply scheduled for ${delaySeconds}s from now (cron will post)`);
      console.log(`   === AUTO-REPLY SCHEDULED ===\n`);
      return;
    }

    // Post reply to Facebook/Instagram
    if (!connectedPage.pageAccessToken) {
      console.error(`   ❌ Missing token`);
      console.log(`   === AUTO-REPLY FAILED ===\n`);
      return;
    }

    console.log(`   📤 Posting to ${isInstagram ? 'Instagram' : 'Facebook'}...`);

    const replyUrl = isInstagram
      ? `https://graph.facebook.com/v24.0/${externalCommentId}/replies`
      : `https://graph.facebook.com/v24.0/${externalCommentId}/comments`;
    
    const replyResponse = await fetch(replyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: aiResult.reply,
        access_token: connectedPage.pageAccessToken,
      }),
    });
    
    console.log(`   📥 Response status: ${replyResponse.status}`);
    
    if (replyResponse.ok) {
      const replyData = await replyResponse.json();
      console.log(`   🎉 ✅ Reply posted successfully!`);
      console.log(`   🆔 Reply ID: ${replyData.id}`);
      
      await prisma.comment.update({
        where: { id: commentDbId },
        data: {
          replied: true,
          replyMessage: aiResult.reply,
          status: 'replied',
        },
      });
      console.log(`   === AUTO-REPLY COMPLETE ===\n`);
    } else {
      const errorText = await replyResponse.text();
      console.error(`   ❌ Failed to post reply`);
      console.error(`   Error: ${errorText.substring(0, 200)}`);
      
      await prisma.comment.update({
        where: { id: commentDbId },
        data: {
          status: 'ai_failed',
          aiError: `Failed to post reply: ${errorText.substring(0, 200)}`,
        },
      });
      console.log(`   === AUTO-REPLY FAILED ===\n`);
    }
  } catch (error: any) {
    console.error(`   ❌ === AUTO-REPLY ERROR ===`);
    console.error(`   💥 Error: ${error?.message}`);
    console.error(`   Stack: ${error?.stack?.substring(0, 300)}`);
    
    try {
      await prisma.comment.update({
        where: { id: commentDbId },
        data: {
          status: 'ai_failed',
          aiError: error?.message || 'Unknown error',
        },
      });
    } catch {
      console.error(`   ❌ Failed to update comment after error`);
    }
    console.log(`   === AUTO-REPLY FAILED ===\n`);
  }
}


export async function GET(request: NextRequest) {
  const performanceStart = Date.now();
  
  try {
    const authStart = Date.now();
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const pageId = searchParams.get('pageId');


    if (!pageId) {
      return NextResponse.json(
        { error: 'Page ID is required' },
        { status: 400 }
      );
    }

    // Get connected page (exclude soft-deleted/disconnected)
    const dbQueryStart = Date.now();
    const connectedPage = await prisma.connectedPage.findFirst({
      where: {
        userId: session.user.id,
        pageId,
        disconnectedAt: null,
      },
    });

    if (!connectedPage) {
      return NextResponse.json(
        { error: 'Page not found or not connected' },
        { status: 404 }
      );
    }

    // Comments are ingested via Meta webhooks — just return cached DB comments
    const storedComments = await prisma.comment.findMany({
      where: {
        pageId: connectedPage.id,
        // Exclude the page's own AI/manual replies
        NOT: {
          AND: [
            { isReply: true },
            { authorName: { equals: connectedPage.pageName, mode: 'insensitive' } },
          ],
        },
      },
      include: {
        connectedPage: {
          select: {
            pageName: true,
            provider: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 100,
    });

    const formattedComments = storedComments.map(comment => ({
      id: comment.id,
      commentId: comment.commentId,
      message: comment.message,
      authorName: comment.authorName,
      createdAt: comment.createdAt.toISOString(),
      status: comment.status,
      sentiment: comment.sentiment,
      postId: comment.postId,
      postMessage: '',
      pageName: comment.connectedPage.pageName,
      provider: comment.connectedPage.provider,
      isFromAd: comment.isFromAd,
      adId: comment.adId,
      adName: comment.adName,
      source: (comment as any).source,
      hiddenAt: comment.hiddenAt?.toISOString() || null,
      deletedAt: comment.deletedAt?.toISOString() || null,
      automationStatus: comment.automationStatus || null,
      aiGeneratedReply: comment.aiGeneratedReply || null,
      replied: comment.replied,
      replyMessage: comment.replyMessage || null,
      needsReview: comment.needsReview || false,
      scheduledPostAt: comment.scheduledPostAt?.toISOString() || null,
      isReply: comment.isReply || false,
      parentCommentId: comment.parentCommentId || null,
    }));

    return NextResponse.json({
      comments: formattedComments,
      newCommentsCount: 0,
      lastFetchedAt: connectedPage.lastCommentsFetchedAt?.toISOString() || null,
      fetched: 0,
      isCached: true,
      backgroundFetching: false,
      webhookOnly: true,
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error) {
    
    if (error instanceof Error) {
    } else {
    }
    
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: 'Failed to fetch comments. Please try again or check your page connection.',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

