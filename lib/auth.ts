import { PrismaAdapter } from '@auth/prisma-adapter';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import FacebookProvider from 'next-auth/providers/facebook';
import type { JWT } from 'next-auth/jwt';
import type { Session, User, Account, Profile } from 'next-auth';
import { prisma } from './prisma';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { isRateLimited, recordFailedAttempt, resetRateLimit } from './rateLimit';

export const authOptions = {
  // Adapter is needed for OAuth providers to store accounts in database
  // It won't interfere with JWT sessions
  adapter: PrismaAdapter(prisma) as any,
  trustHost: true,
  // Ensure NEXTAUTH_URL is set for production
  ...(process.env.NEXTAUTH_URL && { url: process.env.NEXTAUTH_URL }),
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        try {
          if (!credentials?.email || !credentials?.password) {
            return null;
          }

          const email = (credentials.email as string).toLowerCase().trim();
          const password = credentials.password as string;

          const rateLimitKey = `login:${email}`;

          // Enforce the rate limit on the server. The login page also pre-checks
          // via /api/auth/rate-limit, but a direct POST to the credentials
          // callback would otherwise bypass throttling and allow brute force.
          if (isRateLimited(rateLimitKey).limited) {
            return null;
          }

          const user = await prisma.user.findUnique({
            where: { email },
          });

          if (!user || !user.password) {
            recordFailedAttempt(rateLimitKey);
            return null;
          }

          const isPasswordValid = await bcrypt.compare(password, user.password);

          if (!isPasswordValid) {
            recordFailedAttempt(rateLimitKey);
            return null;
          }

          // Block unverified email accounts
          if (!user.emailVerified) {
            return null;
          }

          // Reset rate limit on successful login
          resetRateLimit(rateLimitKey);

          return {
            id: user.id,
            name: user.name || user.email.split('@')[0],
            email: user.email,
            image: user.image || undefined,
            role: user.role,
          };
        } catch (error) {
          return null;
        }
      },
    }),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
    ...(process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET
      ? [
          FacebookProvider({
            clientId: process.env.FACEBOOK_CLIENT_ID!,
            clientSecret: process.env.FACEBOOK_CLIENT_SECRET!,
            authorization: {
              params: {
                scope: 'pages_read_engagement pages_manage_engagement pages_show_list pages_manage_posts pages_manage_metadata instagram_basic instagram_manage_comments business_management ads_read',
              },
            },
          }),
        ]
      : []),
  ],
  pages: {
    signIn: '/login',
    signOut: '/',
    error: '/login',
  },
  callbacks: {
    async signIn({ user, account, profile }: { user: User; account?: Account | null; profile?: Profile }) {
      // For Google OAuth, ensure emailVerified is set (handles case where user had unverified credentials account)
      if (account?.provider === 'google' && user.id) {
        try {
          await prisma.user.updateMany({
            where: { id: user.id, emailVerified: null },
            data: { emailVerified: new Date() },
          });
        } catch {}
      }

      // If this is Facebook OAuth, link it to the current logged-in user
      if (account?.provider === 'facebook' && account?.access_token) {
        try {
          // Get the original user ID from cookie (set before OAuth)
          const cookieStore = await cookies();
          const linkingUserId = cookieStore.get('linking_user_id')?.value;
          
          // Exchange short-lived token for long-lived token (60 days) immediately
          let longLivedToken = account.access_token;
          try {
            const tokenExchangeUrl = `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.FACEBOOK_CLIENT_ID}&client_secret=${process.env.FACEBOOK_CLIENT_SECRET}&fb_exchange_token=${account.access_token}`;
            
            const tokenResponse = await fetch(tokenExchangeUrl);
            
            if (tokenResponse.ok) {
              const tokenData = await tokenResponse.json();
              longLivedToken = tokenData.access_token;
              // Note: We can't mutate account.access_token directly (it's read-only)
              // We'll update it in the database after NextAuth saves the account
            } else {
              const errorText = await tokenResponse.text();
              console.error('[Auth] Facebook long-lived token exchange failed (signIn callback):', errorText);
              // Continue with short-lived token - we'll try to exchange it later
            }
          } catch (tokenError) {
            console.error('[Auth] Facebook token exchange request errored (signIn callback):', tokenError);
            // Continue with short-lived token
          }
          
          if (linkingUserId && linkingUserId !== user.id) {
            // user.id is whoever NextAuth resolved this Facebook OAuth to.
            // If that user already has real data (connected pages or comments),
            // this is NOT a duplicate created by OAuth — it's a different real user
            // whose Facebook account is being stolen. Block the link.
            const existingPagesCount = await prisma.connectedPage.count({
              where: { userId: user.id, disconnectedAt: null },
            });
            const existingAccountsCount = await prisma.account.count({
              where: { userId: user.id, NOT: { providerAccountId: account.providerAccountId } },
            });

            if (existingPagesCount > 0 || existingAccountsCount > 0) {
              throw new Error('FacebookAccountInUse');
            }

            // Safe: user.id has no data — it's a fresh duplicate from OAuth
            const newUserId = user.id;

            // Link the Facebook account to the original user immediately with long-lived token
            const updateResult = await prisma.account.updateMany({
              where: {
                providerAccountId: account.providerAccountId,
                provider: 'facebook',
              },
              data: {
                userId: linkingUserId,
                access_token: longLivedToken, // Store the long-lived token
              },
            });
            // Get the original user to update the user object
            const originalUser = await prisma.user.findUnique({
              where: { id: linkingUserId },
            });

            if (originalUser) {
              // Update the user object to point to original user
              // This prevents NextAuth from creating a new session with the new user
              user.id = originalUser.id;
              user.email = originalUser.email;
              user.name = originalUser.name || user.name;

              // Delete the duplicate user created by OAuth (use the stored newUserId)
              try {
                await prisma.user.delete({
                  where: { id: newUserId },
                });
              } catch (deleteError) {
                // User might have dependencies, that's okay
              }
            }
          } else if (linkingUserId && linkingUserId === user.id) {
            // Account already linked to this user (reconnection scenario)
            // Just update the token
            const updateResult = await prisma.account.updateMany({
              where: {
                providerAccountId: account.providerAccountId,
                provider: 'facebook',
                userId: linkingUserId,
              },
              data: {
                access_token: longLivedToken, // Update with long-lived token
              },
            });
          } else {
          }
        } catch (error) {
          console.error('[Auth] Facebook account linking failed:', error);
        }
      }

      return true;
    },
    async jwt({ token, user, account }: { token: JWT; user?: User | undefined; account?: Account | null }) {
      try {
        if (user) {
          // If we have an existing token with a user ID and this is a Facebook OAuth,
          // and the user ID matches the token ID (meaning we linked in signIn callback),
          // keep the original token to preserve the session
          if (token.id && account?.provider === 'facebook' && user.id === token.id) {
            return token;
          }

          // Normal sign-in - update token with user info
          token.id = user.id;
          token.name = user.name;
          token.email = user.email;
          token.role = (user as any).role || 'USER';

          // Read rememberMe from cookie (set by login form before signIn)
          const cookieStore = await cookies();
          const rememberMe = cookieStore.get('remember_me')?.value !== 'false';
          token.rememberMe = rememberMe;
          token.loginAt = Math.floor(Date.now() / 1000);
        }

        // Re-apply expiry on every JWT refresh so NextAuth can't override it
        if (token.rememberMe === false && token.loginAt) {
          // No remember me: expire 8 hours from login, never extend
          token.exp = (token.loginAt as number) + 8 * 60 * 60;
        } else {
          // Remember me: keep extending — 30 days from now
          token.exp = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
        }

        // Backfill role for existing tokens that don't have it yet
        if (token.id && !token.role) {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { role: true },
          });
          token.role = dbUser?.role || 'USER';
        }

        return token;
      } catch (error) {
        return token;
      }
    },
    async session({ session, token }: { session: Session; token: JWT }) {
      try {
        if (token && session.user) {
          session.user.id = token.id as string;
          session.user.name = token.name as string;
          session.user.email = token.email as string;
          session.user.role = (token.role as string) || 'USER';
        }
        return session;
      } catch (error) {
        return session;
      }
    },
  },
  events: {
    async signIn(message: { user: User; account?: any; profile?: any; isNewUser?: boolean }) {
      // If this is Facebook OAuth, ensure the token in database is long-lived
      // This runs AFTER NextAuth's PrismaAdapter has saved the account
      if (message.account?.provider === 'facebook' && message.account?.access_token) {
        try {
          // Find the account that was just created/updated by NextAuth
          const savedAccount = await prisma.account.findFirst({
            where: {
              provider: 'facebook',
              providerAccountId: message.account.providerAccountId,
              userId: message.user.id,
            },
          });

          if (savedAccount) {
            // Check if the stored token is the same as the original (short-lived) token
            // This means the exchange in signIn callback might have failed
            if (savedAccount.access_token === message.account.access_token) {
              // Token wasn't exchanged in signIn callback, try now
              try {
                const tokenExchangeUrl = `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.FACEBOOK_CLIENT_ID}&client_secret=${process.env.FACEBOOK_CLIENT_SECRET}&fb_exchange_token=${message.account.access_token}`;
                const tokenResponse = await fetch(tokenExchangeUrl);
                
                if (tokenResponse.ok) {
                  const tokenData = await tokenResponse.json();
                  const longLivedToken = tokenData.access_token;
                  
                  // Update the stored token in database
                  await prisma.account.update({
                    where: { id: savedAccount.id },
                    data: { access_token: longLivedToken },
                  });
                  
                } else {
                  const errorText = await tokenResponse.text();
                  console.error('[Auth] Facebook long-lived token exchange failed (signIn event):', errorText);
                }
              } catch (tokenError) {
                console.error('[Auth] Facebook token exchange request errored (signIn event):', tokenError);
              }
            } else {
            }
          } else {
          }
        } catch (error) {
          console.error('[Auth] Facebook token persistence (signIn event) failed:', error);
        }
      }

      // Update lastLoginAt for every sign-in
      try {
        await prisma.user.update({
          where: { id: message.user.id },
          data: { lastLoginAt: new Date() },
        });
      } catch {}

      // Log successful sign-ins in development
      if (process.env.NODE_ENV === 'development') {
      }
    },
    async signOut() {
      // Handle sign out if needed
    },
  },
  // Logger removed - NextAuth v5 handles logging internally
  // If you need custom logging, you can add it back with the correct v5 signature
  session: {
    strategy: 'jwt' as const,
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
};
