import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

// Validate required environment variables at startup
if (!process.env.NEXTAUTH_SECRET) {
}

if (!process.env.DATABASE_URL) {
}

// NextAuth v5 returns handlers object with GET and POST
const { handlers } = NextAuth(authOptions);

export const { GET, POST } = handlers;
