import { useEffect, useRef, useState, useCallback } from "react";

interface Mailbox {
  id: string;
  name: string;
  unread?: number;
}

interface Attachment {
  id: string;
  filename: string;
  contentType?: string;
  size?: number;
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
  attachments?: Attachment[];
}

interface EmailPanelProps {
  mailboxes: Mailbox[];
  activeMailbox: string | null;
  onSelectMailbox: (id: string) => void;
  messages: Message[];
  loadingMsgs: boolean;
  activeMessage: FullMessage | null;
  loadingBody: boolean;
  onSelectMessage: (id: string) => void;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  newMailCount?: number;
  onClearMessage?: () => void;
  /** Base URL prefix for building attachment download URLs, e.g. "/api/admin/customer-emails/user@example.com" or "/api/portal" */
  attachmentBaseUrl?: string;
}

function groupByDate(messages: Message[]): Record<string, Message[]> {
  const groups: Record<string, Message[]> = {};
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  for (const msg of messages) {
    const dateStr = msg.date || msg.created_at || "";
    const date = dateStr ? new Date(dateStr) : new Date(0);
    let group = "Older";
    if (date >= today) group = "Today";
    else if (date >= yesterday) group = "Yesterday";
    else if (date >= weekAgo) group = "This Week";

    if (!groups[group]) groups[group] = [];
    groups[group].push(msg);
  }
  return groups;
}

const MAILBOX_ICONS: Record<string, string> = {
  inbox: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
  sent: "M12 19l9 2-9-18-9 18 9-2zm0 0v-8",
  trash: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
  junk: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
  drafts: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
};

function formatFileSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const FILE_ICONS: Record<string, string> = {
  pdf: "M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z",
  image: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z",
  default: "M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13",
};

function getFileIcon(contentType?: string): string {
  if (!contentType) return FILE_ICONS.default;
  if (contentType.includes("pdf")) return FILE_ICONS.pdf;
  if (contentType.startsWith("image/")) return FILE_ICONS.image;
  return FILE_ICONS.default;
}

export default function EmailPanel({
  mailboxes,
  activeMailbox,
  onSelectMailbox,
  messages,
  loadingMsgs,
  activeMessage,
  loadingBody,
  onSelectMessage,
  searchQuery = "",
  onSearchChange,
  newMailCount = 0,
  onClearMessage,
  attachmentBaseUrl,
}: EmailPanelProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const downloadAttachment = useCallback(async (att: Attachment) => {
    if (!attachmentBaseUrl || !activeMailbox || !activeMessage) return;
    setDownloadingId(att.id);
    try {
      const tokenKey = window.location.pathname.startsWith("/portal") ? "portal_token" : "admin_token";
      const token = localStorage.getItem(tokenKey);
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
      const url = `${apiUrl}${attachmentBaseUrl}/mailboxes/${activeMailbox}/messages/${activeMessage.id}/attachments/${att.id}`;
      const resp = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) throw new Error("Download failed");
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = att.filename || "attachment";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      // silent fail
    } finally {
      setDownloadingId(null);
    }
  }, [attachmentBaseUrl, activeMailbox, activeMessage]);

  const filteredMessages = searchQuery
    ? messages.filter(
        (m) =>
          (m.subject || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
          (m.from || m.sender || "").toLowerCase().includes(searchQuery.toLowerCase())
      )
    : messages;

  const grouped = groupByDate(filteredMessages);
  const groupOrder = ["Today", "Yesterday", "This Week", "Older"];

  useEffect(() => {
    if (activeMessage?.html && iframeRef.current) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(`
          <html>
          <head><style>
            body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; color: #191919; margin: 16px; line-height: 1.6; }
            img { max-width: 100%; }
            a { color: #FF3008; }
          </style></head>
          <body>${activeMessage.html}</body>
          </html>
        `);
        doc.close();
        // Make all links open in a new tab
        const links = doc.querySelectorAll("a");
        links.forEach((a) => {
          a.setAttribute("target", "_blank");
          a.setAttribute("rel", "noopener noreferrer");
        });
      }
    }
  }, [activeMessage]);

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left — Mailboxes */}
      <div className="w-48 bg-white border-r border-dd-200 flex-shrink-0 overflow-y-auto hidden md:block">
        <div className="px-4 py-3 border-b border-dd-200">
          <span className="text-[11px] font-bold text-dd-600 uppercase tracking-wider">Mailboxes</span>
        </div>
        {mailboxes.map((mb) => {
          const iconPath = MAILBOX_ICONS[mb.name.toLowerCase()] || MAILBOX_ICONS.inbox;
          return (
            <button
              key={mb.id}
              onClick={() => onSelectMailbox(mb.id)}
              className={`w-full text-left px-4 py-2.5 text-sm border-b border-dd-200 hover:bg-dd-50 transition-colors flex items-center gap-2.5 ${
                activeMailbox === mb.id
                  ? "bg-dd-red-light text-dd-red font-semibold"
                  : "text-dd-800"
              }`}
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={iconPath} />
              </svg>
              <span className="flex-1">{mb.name}</span>
              {mb.unread && mb.unread > 0 && (
                <span className="bg-dd-red text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                  {mb.unread}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Middle — Message List */}
      <div className={`w-full sm:w-80 border-r border-dd-200 flex-shrink-0 overflow-y-auto bg-white flex flex-col ${activeMessage ? "hidden sm:flex" : "flex"}`}>
        {onSearchChange && (
          <div className="px-3 py-2.5 border-b border-dd-200 flex-shrink-0">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dd-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search emails..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-dd-100 rounded-lg text-sm text-dd-950 placeholder:text-dd-500 focus:ring-2 focus:ring-dd-red/20 focus:outline-none border border-transparent focus:border-dd-red/30"
              />
            </div>
          </div>
        )}

        {newMailCount > 0 && (
          <div className="px-4 py-2 bg-dd-red-light text-dd-red text-xs font-semibold border-b border-dd-200">
            {newMailCount} new email{newMailCount > 1 ? "s" : ""}
          </div>
        )}

        {loadingMsgs ? (
          <div className="p-4 text-dd-500 text-sm">Loading...</div>
        ) : filteredMessages.length === 0 ? (
          <div className="p-4 text-dd-500 text-sm">No messages</div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {groupOrder.map((group) => {
              const msgs = grouped[group];
              if (!msgs || msgs.length === 0) return null;
              return (
                <div key={group}>
                  <div className="px-4 py-1.5 bg-dd-50 text-[10px] font-bold text-dd-600 uppercase tracking-wider sticky top-0 border-b border-dd-200">
                    {group}
                  </div>
                  {msgs.map((msg) => (
                    <button
                      key={msg.id}
                      onClick={() => onSelectMessage(msg.id)}
                      className={`w-full text-left px-4 py-3 border-b border-dd-200 hover:bg-dd-50 transition-colors ${
                        activeMessage?.id === msg.id ? "bg-dd-red-light" : ""
                      } ${msg.seen === false ? "font-semibold" : ""}`}
                    >
                      <div className="text-xs text-dd-600 truncate">
                        {msg.from || msg.sender || "Unknown"}
                      </div>
                      <div className={`text-sm truncate mt-0.5 ${activeMessage?.id === msg.id ? "text-dd-red" : "text-dd-950"}`}>
                        {msg.subject || "(no subject)"}
                      </div>
                      <div className="text-[10px] text-dd-500 mt-0.5">
                        {(msg.date || msg.created_at)
                          ? new Date(msg.date || msg.created_at!).toLocaleString()
                          : ""}
                      </div>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Right — Reading Pane */}
      <div className={`flex-1 overflow-hidden flex flex-col bg-white ${activeMessage ? "flex" : "hidden sm:flex"}`}>
        {loadingBody ? (
          <div className="p-6 text-dd-500 text-sm">Loading...</div>
        ) : activeMessage ? (
          <>
            <div className="p-5 border-b border-dd-200 flex-shrink-0">
              <button
                onClick={() => onClearMessage?.()}
                className="sm:hidden flex items-center gap-1 text-sm text-dd-red font-medium mb-3"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
              <h2 className="text-lg font-bold text-dd-950">{activeMessage.subject}</h2>
              <div className="text-sm text-dd-700 mt-1.5 flex items-center gap-2">
                <span className="font-medium">From:</span>
                {activeMessage.from || activeMessage.sender || "Unknown"}
              </div>
              <div className="text-xs text-dd-500 mt-1">
                {(activeMessage.date || activeMessage.created_at) &&
                  new Date(activeMessage.date || activeMessage.created_at!).toLocaleString()}
              </div>
              {/* Attachments */}
              {activeMessage.attachments && activeMessage.attachments.length > 0 && attachmentBaseUrl && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {activeMessage.attachments.map((att) => (
                    <button
                      key={att.id}
                      onClick={() => downloadAttachment(att)}
                      disabled={downloadingId === att.id}
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-dd-100 hover:bg-dd-200 rounded-lg border border-dd-200 transition-colors text-left group"
                    >
                      <svg className="w-4 h-4 text-dd-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={getFileIcon(att.contentType)} />
                      </svg>
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-dd-950 truncate max-w-[180px]">{att.filename}</div>
                        {att.size && <div className="text-[10px] text-dd-500">{formatFileSize(att.size)}</div>}
                      </div>
                      {downloadingId === att.id ? (
                        <svg className="w-3.5 h-3.5 text-dd-500 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5 text-dd-500 group-hover:text-dd-red flex-shrink-0 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex-1 overflow-hidden">
              {activeMessage.html ? (
                <iframe
                  ref={iframeRef}
                  title="Email content"
                  className="w-full h-full border-0"
                  sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                />
              ) : (
                <div className="p-5 whitespace-pre-wrap text-sm text-dd-800 leading-relaxed">
                  {activeMessage.text || "No content"}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-dd-500 text-sm">
            Select a message to read
          </div>
        )}
      </div>
    </div>
  );
}
