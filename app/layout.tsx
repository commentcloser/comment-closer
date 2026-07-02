import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ClientProvider from "./ClientProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Get Facebook App ID at build time - must be available during build for static generation
// In Vercel: Make sure FACEBOOK_CLIENT_ID is set in Environment Variables
// For client-side access, you can also use NEXT_PUBLIC_FACEBOOK_CLIENT_ID
const facebookAppId = process.env.FACEBOOK_CLIENT_ID || process.env.NEXT_PUBLIC_FACEBOOK_CLIENT_ID || '';

export const metadata: Metadata = {
  title: "Comment Closer - Automate Facebook Comment Management",
  description: "Save time and protect your brand with AI-powered comment moderation for Facebook Pages. Fast, safe, and fully automated.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {facebookAppId && (
          <meta property="fb:app_id" content={facebookAppId} />
        )}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                if (typeof document !== 'undefined' && document.documentElement) {
                const theme = localStorage.getItem('theme');
                const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                const shouldBeDark = theme === 'dark' || (!theme && prefersDark);
                
                if (shouldBeDark) {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
                }
              } catch (e) {
                // Silently fail if localStorage or matchMedia not available
              }
            `,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-white dark:bg-black transition-colors`}
      >
        <ClientProvider>
          {children}
        </ClientProvider>
      </body>
    </html>
  );
}
