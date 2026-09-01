import type { Metadata } from "next";
import { DM_Sans, IBM_Plex_Sans_Arabic, Playfair_Display } from "next/font/google";
import { Providers } from "@/components/providers";
import { appUrl } from "@/lib/utils";
import "./globals.css";

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

const ibm = IBM_Plex_Sans_Arabic({
  variable: "--font-ibm",
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const dm = DM_Sans({
  variable: "--font-dm",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Bridey - Beauty Business Booking & Management",
    template: "%s · Bridey",
  },
  description:
    "Bridey helps makeup artists, hairstylists, beauty centers and salons manage bookings, teams, appointments and payments in one place.",
  metadataBase: new URL(appUrl()),
  openGraph: {
    title: "Bridey - Beauty Business Booking & Management",
    description:
      "Your beauty business, beautifully organized. Bookings, team, appointments and payments. 5 LYD per confirmed booking, no monthly subscription.",
    locale: "ar_LY",
    alternateLocale: "en_US",
    type: "website",
    siteName: "Bridey",
    url: appUrl(),
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${playfair.variable} ${ibm.variable} ${dm.variable} h-full`}>
      <body className="min-h-full antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
