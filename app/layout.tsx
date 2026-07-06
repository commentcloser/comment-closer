import type { Metadata, Viewport } from "next";
import { Commissioner, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import ClientProvider from "./ClientProvider";

const commissioner = Commissioner({
  subsets: ["latin", "greek"],
  weight: "variable",            // 100–900 variable axis
  display: "swap",
  variable: "--font-commissioner",
  fallback: ["Inter", "Arial", "sans-serif"],
  adjustFontFallback: true,
});

const inter = Inter({
  subsets: ["latin", "greek"],
  display: "swap",
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "greek"],
  weight: ["500", "700"],
  display: "swap",
  variable: "--font-jetbrains",
});

// Get Facebook App ID at build time - must be available during build for static generation
// In Vercel: Make sure FACEBOOK_CLIENT_ID is set in Environment Variables
// For client-side access, you can also use NEXT_PUBLIC_FACEBOOK_CLIENT_ID
const facebookAppId = process.env.FACEBOOK_CLIENT_ID || process.env.NEXT_PUBLIC_FACEBOOK_CLIENT_ID || '';

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3055"),
  ),
  title: "Comment Closer — Stop losing sales in your ad comments",
  description:
    "Your ad comment section is quietly costing you sales. Comment Closer automatically hides negative comments and replies to every one on your Facebook, Instagram and TikTok ads — so your comments sell for you instead of scaring buyers off. Free during early access.",
  keywords: [
    "comment moderation",
    "AI comment management",
    "Facebook ad comments",
    "Instagram comment automation",
    "TikTok comment moderation",
    "auto reply comments",
    "hide negative comments",
    "social ad performance",
  ],
  openGraph: {
    title: "Stop losing sales in your ad comments",
    description:
      "AI that automatically hides negative comments and replies to every one on your Facebook, Instagram & TikTok ads. Free during early access.",
    siteName: "Comment Closer",
    type: "website",
    images: [
      {
        url: "/api/og",
        width: 1200,
        height: 630,
        alt: "Comment Closer — stop losing sales in your ad comments",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Stop losing sales in your ad comments",
    description:
      "AI that hides negative comments and replies to every one on your FB, IG & TikTok ads — so your comment section sells instead of costing you.",
    images: ["/api/og"],
  },
};

// Dark-first: match the mobile browser chrome (address bar / status bar) to the
// app's dark canvas so the experience feels edge-to-edge and branded, not white.
export const viewport: Viewport = {
  themeColor: "#070714",
  colorScheme: "dark light",
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
                const shouldBeDark = theme ? theme === 'dark' : true;
                
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
        className={`${commissioner.variable} ${inter.variable} ${jetbrainsMono.variable} antialiased bg-canvas text-ink transition-colors`}
      >
        <ClientProvider>
          {children}
        </ClientProvider>
      </body>
    </html>
  );
}
