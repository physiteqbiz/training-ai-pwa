import type { Metadata, Viewport } from "next";

import { BottomNav } from "@/components/BottomNav";
import { PwaRegister } from "@/components/PwaRegister";

import "./globals.css";

export const metadata: Metadata = {
  title: "筋トレ診断AI",
  description: "筋トレ記録とAI診断のPWA",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "筋トレ診断AI"
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#101418"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>
        <PwaRegister />
        <main className="app-frame">{children}</main>
        <BottomNav />
      </body>
    </html>
  );
}
