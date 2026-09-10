import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";

/* Typeface system — DM Sans, and only DM Sans. Matching vehere-ui's theme
   ('DM Sans, sans-serif'); no serif and no monospaced face is loaded. */
const dmSans = localFont({
  src: [
    { path: "./fonts/DMSans-Variable.woff2", weight: "100 1000", style: "normal" },
    { path: "./fonts/DMSans-VariableItalic.woff2", weight: "100 1000", style: "italic" },
  ],
  variable: "--font-sans",
  display: "swap",
});


export const metadata: Metadata = {
  title: "SpiderX — Vehere",
  description: "SpiderX Network Detection & Response console",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${dmSans.variable} font-sans antialiased`}
      >
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <TooltipProvider delayDuration={120}>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
