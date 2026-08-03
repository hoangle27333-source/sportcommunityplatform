import type { Metadata, Viewport } from "next";
import { Fira_Sans, Fira_Code } from "next/font/google";
import "./globals.css";

/**
 * Fonts are loaded via next/font (self-hosted, non-blocking) instead of
 * a CSS @import which is render-blocking and increases LCP.
 * Vietnamese subset is included so diacritics render correctly.
 */
const firaSans = Fira_Sans({
  subsets: ["latin", "vietnamese"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const firaCode = Fira_Code({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Content Automation Hub",
    template: "%s · Content Hub",
  },
  description:
    "Nền tảng tự động hoá sản xuất & phân phối nội dung mạng xã hội (Facebook + Instagram).",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // No maximumScale/userScalable lock — pinch zoom must stay available (NFR5).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F8FAFC" },
    { media: "(prefers-color-scheme: dark)", color: "#0B1220" },
  ],
};

/**
 * Applied before first paint so the theme class is already on <html> when the
 * CSS is evaluated — without this, a dark-mode user sees a white flash on every
 * navigation-less load. Kept inline and dependency-free for that reason.
 */
const THEME_INIT = `
try {
  var stored = localStorage.getItem('theme');
  var dark = stored ? stored === 'dark'
    : window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (dark) document.documentElement.classList.add('dark');
} catch (e) {}
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body suppressHydrationWarning className={`${firaSans.variable} ${firaCode.variable} min-h-screen bg-background font-sans text-foreground antialiased`}>
        {children}
      </body>
    </html>
  );
}
