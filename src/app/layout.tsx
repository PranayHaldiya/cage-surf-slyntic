import "~/styles/globals.css";

import { type Metadata } from "next";
import { Geist, Bricolage_Grotesque } from "next/font/google";

import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: "CageSurf | Safe Browsing Made Simple",
  description: "A voice-first safe browsing assistant for older adults",
  icons: [{ rel: "icon", url: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🦜</text></svg>" }],
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-syne",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable} ${bricolage.variable}`}>
      <body>
        <TRPCReactProvider>{children}</TRPCReactProvider>
      </body>
    </html>
  );
}
