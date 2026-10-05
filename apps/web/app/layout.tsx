import type { Metadata } from "next";
import { Assistant } from "next/font/google";
import "./globals.css";

const assistant = Assistant({ subsets: ["hebrew", "latin"], variable: "--font-assistant" });

export const metadata: Metadata = {
  title: "מכתבי קבלה",
  description: "ניהול הכנה, הערות ואישורים של מכתבי קבלה",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={assistant.variable}>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
