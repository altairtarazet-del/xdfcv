import { useEffect, useRef, useState, useCallback } from "react";
import {
  Mail,
  Paperclip,
  ArrowLeft,
  ChevronRight,
  Download,
  FileText,
  Inbox,
  Search,
  Send,
  Trash2,
  AlertTriangle,
  PenLine,
  Loader2,
} from "lucide-react";
import type { Mailbox, Message, FullMessage, Attachment } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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

const MAILBOX_ICONS: Record<string, React.ElementType> = {
  inbox: Inbox,
  sent: Send,
  trash: Trash2,
  junk: AlertTriangle,
  drafts: PenLine,
};

/** Safely convert any value to a renderable string (guards against object/array from API). */
function safeStr(val: unknown): string {
  if (val == null) return "";
  if (typeof val === "string") return val;
  if (Array.isArray(val)) return val.map(safeStr).join(", ");
  if (typeof val === "object") {
    const obj = val as Record<string, unknown>;
    if (obj.address) {
      return obj.name ? `${obj.name} <${obj.address}>` : String(obj.address);
    }
    return JSON.stringify(val);
  }
  return String(val);
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
        const links = doc.querySelectorAll("a");
        links.forEach((a) => {
          a.setAttribute("target", "_blank");
          a.setAttribute("rel", "noopener noreferrer");
        });
      }
    }
  }, [activeMessage]);

  /* ---- Skeleton loaders ---- */
  const MailboxSkeleton = () => (
    <div className="p-3 space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2.5">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 flex-1" />
        </div>
      ))}
    </div>
  );

  const MessageListSkeleton = () => (
    <div className="p-3 space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );

  const ReadingPaneSkeleton = () => (
    <div className="p-5 space-y-4">
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-3 w-1/3" />
      <Separator />
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* ---- Left: Mailbox List ---- */}
      <div className="w-52 flex-shrink-0 hidden md:flex flex-col border-r border-dd-200 bg-white">
        <div className="px-4 py-3 border-b border-dd-200">
          <span className="text-[11px] font-bold text-dd-600 uppercase tracking-wider">Mailboxes</span>
        </div>
        {mailboxes.length === 0 ? (
          <MailboxSkeleton />
        ) : (
          <ScrollArea className="flex-1">
            <div className="py-1">
              {mailboxes.map((mb) => {
                const IconComp = MAILBOX_ICONS[mb.name.toLowerCase()] || Mail;
                const isActive = activeMailbox === mb.id;
                return (
                  <button
                    key={mb.id}
                    onClick={() => onSelectMailbox(mb.id)}
                    className={cn(
                      "w-full text-left px-4 py-2.5 text-sm flex items-center gap-2.5 transition-colors",
                      isActive
                        ? "bg-dd-red-light text-dd-red font-semibold"
                        : "text-dd-800 hover:bg-dd-50"
                    )}
                  >
                    <IconComp className="h-4 w-4 flex-shrink-0" />
                    <span className="flex-1 truncate">{mb.name}</span>
                    {(mb.unread ?? 0) > 0 && (
                      <Badge className="bg-dd-red text-white border-0 text-[10px] font-bold px-1.5 py-0 min-w-[20px] justify-center hover:bg-dd-red">
                        {mb.unread}
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </div>

      <Separator orientation="vertical" className="hidden md:block" />

      {/* ---- Center: Message List ---- */}
      <div
        className={cn(
          "w-full sm:w-80 flex-shrink-0 bg-white flex flex-col border-r border-dd-200",
          activeMessage ? "hidden sm:flex" : "flex"
        )}
      >
        {onSearchChange && (
          <div className="px-3 py-2.5 border-b border-dd-200 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dd-500" />
              <Input
                type="text"
                placeholder="Search emails..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-9 h-8 bg-dd-100 border-transparent focus-visible:ring-dd-red/20 focus-visible:border-dd-red/30 text-sm"
              />
            </div>
          </div>
        )}

        {newMailCount > 0 && (
          <div className="px-4 py-2 bg-dd-red-light text-dd-red text-xs font-semibold border-b border-dd-200 flex items-center gap-2">
            <Mail className="h-3.5 w-3.5" />
            {newMailCount} new email{newMailCount > 1 ? "s" : ""}
          </div>
        )}

        {loadingMsgs ? (
          <MessageListSkeleton />
        ) : filteredMessages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-dd-500 py-12">
            <Inbox className="h-10 w-10 mb-3 text-dd-300" />
            <p className="text-sm font-medium">No messages</p>
            <p className="text-xs mt-1">
              {searchQuery ? "Try a different search term" : "This mailbox is empty"}
            </p>
          </div>
        ) : (
          <ScrollArea className="flex-1">
            {groupOrder.map((group) => {
              const msgs = grouped[group];
              if (!msgs || msgs.length === 0) return null;
              return (
                <div key={group}>
                  <div className="px-4 py-1.5 bg-dd-50 text-[10px] font-bold text-dd-600 uppercase tracking-wider sticky top-0 border-b border-dd-200">
                    {group}
                  </div>
                  {msgs.map((msg) => {
                    const isSelected = activeMessage?.id === msg.id;
                    const isUnread = msg.seen === false;
                    return (
                      <button
                        key={msg.id}
                        onClick={() => onSelectMessage(msg.id)}
                        className={cn(
                          "w-full text-left px-4 py-3 border-b border-dd-200 transition-colors group",
                          isSelected ? "bg-dd-red-light" : "hover:bg-dd-50",
                          isUnread && "font-semibold"
                        )}
                      >
                        <div className="flex items-center gap-1.5">
                          {isUnread && (
                            <span className="h-2 w-2 rounded-full bg-dd-red flex-shrink-0" />
                          )}
                          <span className="text-xs text-dd-600 truncate flex-1">
                            {safeStr(msg.from) || safeStr(msg.sender) || "Unknown"}
                          </span>
                          <ChevronRight className="h-3.5 w-3.5 text-dd-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                        </div>
                        <div
                          className={cn(
                            "text-sm truncate mt-0.5",
                            isSelected ? "text-dd-red" : "text-dd-950"
                          )}
                        >
                          {msg.subject || "(no subject)"}
                        </div>
                        <div className="text-[10px] text-dd-500 mt-0.5">
                          {(msg.date || msg.created_at)
                            ? new Date(msg.date || msg.created_at!).toLocaleString()
                            : ""}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </ScrollArea>
        )}
      </div>

      {/* ---- Right: Reading Pane ---- */}
      <div
        className={cn(
          "flex-1 overflow-hidden flex flex-col bg-white",
          activeMessage ? "flex" : "hidden sm:flex"
        )}
      >
        {loadingBody ? (
          <ReadingPaneSkeleton />
        ) : activeMessage ? (
          <>
            {/* Header */}
            <CardHeader className="p-5 pb-4 flex-shrink-0 space-y-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onClearMessage?.()}
                className="sm:hidden self-start -ml-2 mb-2 text-dd-red hover:text-dd-red hover:bg-dd-red-light"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <CardTitle className="text-lg font-bold text-dd-950">
                {activeMessage.subject}
              </CardTitle>
              <div className="text-sm text-dd-700 mt-1.5 flex items-center gap-2">
                <span className="font-medium">From:</span>
                {safeStr(activeMessage.from) || safeStr(activeMessage.sender) || "Unknown"}
              </div>
              {activeMessage.to && (
                <div className="text-sm text-dd-600 mt-0.5 flex items-center gap-2">
                  <span className="font-medium">To:</span>
                  {safeStr(activeMessage.to)}
                </div>
              )}
              <div className="text-xs text-dd-500 mt-1">
                {(activeMessage.date || activeMessage.created_at) &&
                  new Date(activeMessage.date || activeMessage.created_at!).toLocaleString()}
              </div>
            </CardHeader>

            {/* Attachments */}
            {activeMessage.attachments && activeMessage.attachments.length > 0 && attachmentBaseUrl && (
              <div className="px-5 pb-3 flex-shrink-0">
                <div className="flex items-center gap-1.5 mb-2">
                  <Paperclip className="h-3.5 w-3.5 text-dd-500" />
                  <span className="text-xs font-medium text-dd-600">
                    {activeMessage.attachments.length} attachment{activeMessage.attachments.length > 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {activeMessage.attachments.map((att) => (
                    <Button
                      key={att.id}
                      variant="outline"
                      size="sm"
                      onClick={() => downloadAttachment(att)}
                      disabled={downloadingId === att.id}
                      className="h-auto py-1.5 px-3 text-left gap-2 border-dd-200 hover:border-dd-red/30 hover:bg-dd-50"
                    >
                      <FileText className="h-4 w-4 text-dd-600 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-dd-950 truncate max-w-[180px]">
                          {att.filename}
                        </div>
                        {att.size && (
                          <div className="text-[10px] text-dd-500">{formatFileSize(att.size)}</div>
                        )}
                      </div>
                      {downloadingId === att.id ? (
                        <Loader2 className="h-3.5 w-3.5 text-dd-500 animate-spin flex-shrink-0" />
                      ) : (
                        <Download className="h-3.5 w-3.5 text-dd-500 flex-shrink-0" />
                      )}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            {/* Email body */}
            <div className="flex-1 overflow-hidden">
              {activeMessage.html ? (
                <iframe
                  ref={iframeRef}
                  title="Email content"
                  className="w-full h-full border-0"
                  sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                />
              ) : (
                <ScrollArea className="h-full">
                  <div className="p-5 whitespace-pre-wrap text-sm text-dd-800 leading-relaxed">
                    {activeMessage.text || "No content"}
                  </div>
                </ScrollArea>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-dd-500">
            <Mail className="h-12 w-12 mb-3 text-dd-300" />
            <p className="text-sm font-medium">Select a message to read</p>
            <p className="text-xs mt-1 text-dd-400">Choose an email from the list</p>
          </div>
        )}
      </div>
    </div>
  );
}
