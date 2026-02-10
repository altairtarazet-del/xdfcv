import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { useTranslation } from "../../i18n/LanguageContext";
import { LanguageSelector } from "../../components/LanguageSelector";

interface Mailbox {
  id: string;
  name: string;
  unread?: number;
}

interface Message {
  id: string;
  from?: string;
  sender?: string;
  subject: string;
  date?: string;
  created_at?: string;
  seen?: boolean;
}

interface FullMessage extends Message {
  html?: string;
  text?: string;
  to?: string;
}

export default function Inbox() {
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [activeMailbox, setActiveMailbox] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeMessage, setActiveMessage] = useState<FullMessage | null>(null);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [loadingBody, setLoadingBody] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const navigate = useNavigate();
  const { t } = useTranslation();

  async function loadMailboxes() {
    try {
      const data = await api.get<{ mailboxes: Mailbox[] }>("/api/portal/mailboxes");
      setMailboxes(data.mailboxes);
      if (data.mailboxes.length > 0) {
        const inbox = data.mailboxes.find((m) => m.name.toLowerCase() === "inbox") || data.mailboxes[0];
        setActiveMailbox(inbox.id);
      }
    } catch {
      // Error handled by API client (401 redirect)
    }
  }

  async function loadMessages(mailboxId: string) {
    setLoadingMsgs(true);
    setActiveMessage(null);
    try {
      const data = await api.get<{ data: Message[] }>(
        `/api/portal/mailboxes/${mailboxId}/messages?per_page=100`
      );
      setMessages(data.data || []);
    } catch {
      setMessages([]);
    } finally {
      setLoadingMsgs(false);
    }
  }

  async function loadMessage(messageId: string) {
    if (!activeMailbox) return;
    setLoadingBody(true);
    try {
      const msg = await api.get<FullMessage>(
        `/api/portal/mailboxes/${activeMailbox}/messages/${messageId}`
      );
      setActiveMessage(msg);
    } catch {
      setActiveMessage(null);
    } finally {
      setLoadingBody(false);
    }
  }

  function logout() {
    localStorage.removeItem("portal_token");
    navigate("/login");
  }

  useEffect(() => {
    loadMailboxes();
  }, []);

  useEffect(() => {
    if (activeMailbox) loadMessages(activeMailbox);
  }, [activeMailbox]);

  // Write HTML to iframe
  useEffect(() => {
    if (activeMessage?.html && iframeRef.current) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(`
          <html>
          <head><style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; color: #333; margin: 16px; }
            img { max-width: 100%; }
            a { color: #2563eb; }
          </style></head>
          <body>${activeMessage.html}</body>
          </html>
        `);
        doc.close();
      }
    }
  }, [activeMessage]);

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b flex-shrink-0">
        <div className="px-4 py-3 flex justify-between items-center">
          <h1 className="text-lg font-bold text-gray-800">{t("dasherHelpMail")}</h1>
          <div className="flex items-center gap-4">
            <LanguageSelector />
            <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-700">{t("logout")}</button>
          </div>
        </div>
      </header>

      {/* 3-Panel Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel — Mailboxes */}
        <div className="w-48 bg-white border-r flex-shrink-0 overflow-y-auto">
          {mailboxes.map((mb) => (
            <button
              key={mb.id}
              onClick={() => setActiveMailbox(mb.id)}
              className={`w-full text-left px-4 py-2.5 text-sm border-b hover:bg-gray-50 transition ${
                activeMailbox === mb.id ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700"
              }`}
            >
              {mb.name}
            </button>
          ))}
        </div>

        {/* Middle Panel — Message List */}
        <div className="w-80 border-r flex-shrink-0 overflow-y-auto bg-white">
          {loadingMsgs ? (
            <div className="p-4 text-gray-400 text-sm">{t("loading")}</div>
          ) : messages.length === 0 ? (
            <div className="p-4 text-gray-400 text-sm">{t("noMessages")}</div>
          ) : (
            messages.map((msg) => (
              <button
                key={msg.id}
                onClick={() => loadMessage(msg.id)}
                className={`w-full text-left px-4 py-3 border-b hover:bg-gray-50 transition ${
                  activeMessage?.id === msg.id ? "bg-blue-50" : ""
                } ${msg.seen === false ? "font-semibold" : ""}`}
              >
                <div className="text-xs text-gray-500 truncate">
                  {msg.from || msg.sender || t("unknown")}
                </div>
                <div className="text-sm truncate mt-0.5">
                  {msg.subject || t("noSubject")}
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5">
                  {(msg.date || msg.created_at) ? new Date(msg.date || msg.created_at!).toLocaleString() : ""}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Right Panel — Reading Pane */}
        <div className="flex-1 overflow-hidden flex flex-col bg-white">
          {loadingBody ? (
            <div className="p-6 text-gray-400 text-sm">{t("loading")}</div>
          ) : activeMessage ? (
            <>
              <div className="p-4 border-b flex-shrink-0">
                <h2 className="text-lg font-semibold text-gray-800">{activeMessage.subject}</h2>
                <div className="text-sm text-gray-500 mt-1">
                  {activeMessage.from || activeMessage.sender || t("unknown")}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {(activeMessage.date || activeMessage.created_at) &&
                    new Date(activeMessage.date || activeMessage.created_at!).toLocaleString()}
                </div>
              </div>
              <div className="flex-1 overflow-hidden">
                {activeMessage.html ? (
                  <iframe
                    ref={iframeRef}
                    title="Email content"
                    className="w-full h-full border-0"
                    sandbox="allow-same-origin"
                  />
                ) : (
                  <div className="p-4 whitespace-pre-wrap text-sm text-gray-700">
                    {activeMessage.text || t("noContent")}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              {t("selectMessage")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
