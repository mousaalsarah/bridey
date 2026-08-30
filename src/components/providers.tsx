"use client";

import { LanguageProvider } from "@/lib/language";

export function Providers({ children }: { children: React.ReactNode }) {
  return <LanguageProvider>{children}</LanguageProvider>;
}
