"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { dict, type Lang, type Dict } from "./i18n";

const LanguageContext = createContext<{
  lang: Lang;
  t: Dict;
  dir: "rtl" | "ltr";
  toggle: () => void;
  setLang: (lang: Lang) => void;
} | null>(null);

export function LanguageProvider({
  children,
  initial = "ar",
}: {
  children: React.ReactNode;
  initial?: Lang;
}) {
  const [lang, setLangState] = useState<Lang>(initial);

  useEffect(() => {
    const saved = window.localStorage.getItem("bridey-lang") as Lang | null;
    if (saved === "ar" || saved === "en") setLangState(saved);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("bridey-lang", lang);
    document.documentElement.lang = lang === "ar" ? "ar" : "en";
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  const value = useMemo(
    () => ({
      lang,
      t: dict[lang],
      dir: (lang === "ar" ? "rtl" : "ltr") as "rtl" | "ltr",
      toggle: () => setLangState((l) => (l === "ar" ? "en" : "ar")),
      setLang: setLangState,
    }),
    [lang],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLang must be used within LanguageProvider");
  return ctx;
}
