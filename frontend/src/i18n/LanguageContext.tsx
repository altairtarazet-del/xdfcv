import { createContext, useContext, useState } from "react";
import { translations, type Language, type TranslationKey } from "./translations";

interface LanguageContextValue {
  lang: Language;
  setLanguage: (l: Language) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextValue>(null!);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Language>(
    () => (localStorage.getItem("lang") as Language) || "en"
  );

  function setLanguage(l: Language) {
    setLang(l);
    localStorage.setItem("lang", l);
  }

  function t(key: TranslationKey): string {
    return translations[lang][key];
  }

  return (
    <LanguageContext.Provider value={{ lang, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  return useContext(LanguageContext);
}
