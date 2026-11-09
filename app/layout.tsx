import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")),
  title: "LOUIS CHESS WORLD — Vương quốc 64 ô",
  description: "Thế giới học cờ vua riêng của LOUIS.",
  applicationName: "LOUIS CHESS WORLD",
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
  openGraph: {
    title: "LOUIS CHESS WORLD — Vương quốc 64 ô",
    description: "Một hành trình cờ vua được tạo riêng cho LOUIS.",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="vi"><body>{children}</body></html>;
}
