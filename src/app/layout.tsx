import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "YT Factory",
  description: "AI-powered YouTube video generation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{ background: '#09090b' }}
      >
        {/* Dynamically import client components so this file stays server */}
        <LayoutClientWrapper>{children}</LayoutClientWrapper>
      </body>
    </html>
  );
}

// Inline dynamic import to avoid React.lazy issues in server components
async function LayoutClientWrapper({ children }: { children: React.ReactNode }) {
  const { LayoutClient } = await import("@/components/layout/LayoutClient");
  return <LayoutClient>{children}</LayoutClient>;
}
