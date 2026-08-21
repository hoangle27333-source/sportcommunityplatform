import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, Fira_Code } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

/**
 * Fonts: Be Vietnam Pro (native Vietnamese neo-grotesque font, perfect diacritics) +
 *        Fira Code (monospace for KPI values, code, tabular numbers).
 * Self-hosted via next/font — non-blocking, no external network request,
 * Full Vietnamese subset included for flawless diacritics.
 */
const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["vietnamese", "latin", "latin-ext"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

const firaCode = Fira_Code({
  subsets: ["latin", "latin-ext"],
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
  themeColor: "#F8FAFC",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${beVietnamPro.variable} ${firaCode.variable} min-h-screen bg-background font-sans text-foreground antialiased`}
      >
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            classNames: {
              toast:
                "font-sans rounded-[10px] border border-border shadow-md text-sm",
              success: "border-success/20 bg-success-muted text-foreground",
              error:   "border-destructive/20 bg-destructive-muted text-foreground",
              warning: "border-warning/20 bg-warning-muted text-foreground",
              info:    "border-primary/20 bg-primary-muted text-foreground",
            },
          }}
        />
      </body>
    </html>
  );
}
