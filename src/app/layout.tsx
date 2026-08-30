import type { Metadata } from "next";
import { DM_Sans, IBM_Plex_Sans_Arabic, Playfair_Display } from "next/font/google";
import { Providers } from "@/components/providers";
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
    default: "Bridey · بنغازي",
    template: "%s · Bridey",
  },
  description:
    "منصة حجز مواعيد خبيرات الجمال في بنغازي. شاركي رابطك على سناب شات، والعروس تحجز يومها.",
  openGraph: {
    title: "Bridey · موعد العروس بنقرة واحدة",
    description: "خبيرات بنغازي · حجز من سناب شات · ١٠ د.ل فقط عند تأكيد الموعد",
    locale: "ar_LY",
    type: "website",
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
