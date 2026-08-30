"use client";

import { Brand, Button } from "@/components/ui";
import { useLang } from "@/lib/language";

export default function NotFound() {
  const { lang } = useLang();
  return (
    <div className="bridal-bg grid min-h-screen place-items-center px-5">
      <div className="text-center">
        <Brand />
        <h1 className="mt-8 font-display text-4xl">
          {lang === "ar" ? "الصفحة غير موجودة" : "Page not found"}
        </h1>
        <Button href="/" variant="gold" className="mt-6">
          {lang === "ar" ? "العودة" : "Back home"}
        </Button>
      </div>
    </div>
  );
}
