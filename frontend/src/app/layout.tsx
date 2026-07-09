import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";

import { AuthProvider } from "@/hooks/use-auth";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "LetsCore",
  description: "Personal life information system",
  icons: {
    icon: [{ url: "/brand/logo-mark.png", type: "image/png" }],
    apple: [{ url: "/brand/logo-mark.png", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#2563EB",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="ru" className={inter.variable}>
      <body className={inter.className}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
