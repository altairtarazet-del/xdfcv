import { useState, useEffect, useRef } from "react";

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
}

const CATEGORY_COLORS: Record<string, string> = {
  bgc: "bg-purple-100 text-purple-700",
  account: "bg-blue-100 text-blue-700",
  earnings: "bg-green-100 text-green-700",
  operational: "bg-gray-100 text-gray-600",
  warning: "bg-red-100 text-red-700",
  unknown: "bg-yellow-100 text-yellow-700",
};

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
}: EmailPanelProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Filter messages by search
  const filteredMessages = searchQuery
    ? messages.filter(
        (m) =>
          (m.subject || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
          (m.from || m.sender || "").toLowerCase().includes(searchQuery.toLowerCase())
      )
    : messages;

  const grouped = groupByDate(filteredMessages);
  const groupOrder = ["Today", "Yesterday", "This Week", "Older"];

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
    <div className="flex flex-1 overflow-hidden">
      {/* Left Panel — Mailboxes */}
      <div className="w-48 bg-white border-r flex-shrink-0 overflow-y-auto hidden md:block">
        <div className="px-4 py-3 border-b">
          <span className="text-xs font-semibold text-gray-500 uppercase">Mailboxes</span>
        </div>
        {mailboxes.map((mb) => (
          <button
            key={mb.id}
            onClick={() => onSelectMailbox(mb.id)}
            className={`w-full text-left px-4 py-2.5 text-sm border-b hover:bg-gray-50 transition flex justify-between items-center ${
              activeMailbox === mb.id ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700"
            }`}
          >
            <span>{mb.name}</span>
            {mb.unread && mb.unread > 0 && (
              <span className="bg-blue-600 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                {mb.unread}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Middle Panel — Message List */}
      <div className="w-80 border-r flex-shrink-0 overflow-y-auto bg-white flex flex-col">
        {/* Search */}
        {onSearchChange && (
          <div className="px-3 py-2 border-b flex-shrink-0">
            <input
              type="text"
              placeholder="Search emails..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full px-3 py-1.5 bg-gray-100 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
        )}

        {/* New mail indicator */}
        {newMailCount > 0 && (
          <div className="px-4 py-2 bg-blue-50 text-blue-700 text-xs font-medium border-b">
            {newMailCount} new email{newMailCount > 1 ? "s" : ""}
          </div>
        )}

        {loadingMsgs ? (
          <div className="p-4 text-gray-400 text-sm">Loading...</div>
        ) : filteredMessages.length === 0 ? (
          <div className="p-4 text-gray-400 text-sm">No messages</div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {groupOrder.map((group) => {
              const msgs = grouped[group];
              if (!msgs || msgs.length === 0) return null;
              return (
                <div key={group}>
                  <div className="px-4 py-1.5 bg-gray-50 text-[10px] font-semibold text-gray-500 uppercase sticky top-0">
                    {group}
                  </div>
                  {msgs.map((msg) => (
                    <button
                      key={msg.id}
                      onClick={() => onSelectMessage(msg.id)}
                      className={`w-full text-left px-4 py-3 border-b hover:bg-gray-50 transition ${
                        activeMessage?.id === msg.id ? "bg-blue-50" : ""
                      } ${msg.seen === false ? "font-semibold" : ""}`}
                    >
                      <div className="text-xs text-gray-500 truncate">
                        {msg.from || msg.sender || "Unknown"}
                      </div>
                      <div className="text-sm truncate mt-0.5">
                        {msg.subject || "(no subject)"}
                      </div>
                      <div className="text-[10px] text-gray-400 mt-0.5">
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

      {/* Right Panel — Reading Pane */}
      <div className="flex-1 overflow-hidden flex flex-col bg-white">
        {loadingBody ? (
          <div className="p-6 text-gray-400 text-sm">Loading...</div>
        ) : activeMessage ? (
          <>
            <div className="p-4 border-b flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-800">{activeMessage.subject}</h2>
              <div className="text-sm text-gray-500 mt-1">
                From: {activeMessage.from || activeMessage.sender || "Unknown"}
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
                  {activeMessage.text || "No content"}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            Select a message to read
          </div>
        )}
      </div>
    </div>
  );
}
