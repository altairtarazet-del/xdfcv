import { useTranslation } from "../i18n/LanguageContext";

export function LanguageSelector() {
  const { lang, setLanguage } = useTranslation();
  return (
    <div className="flex text-xs border rounded overflow-hidden">
      <button
        onClick={() => setLanguage("en")}
        className={`px-2 py-1 transition ${
          lang === "en" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
        }`}
      >
        EN
      </button>
      <button
        onClick={() => setLanguage("tr")}
        className={`px-2 py-1 transition ${
          lang === "tr" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
        }`}
      >
        TR
      </button>
    </div>
  );
}
