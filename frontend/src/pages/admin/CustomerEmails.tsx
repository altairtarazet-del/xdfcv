import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api } from "@/api/client";
import EmailPanel from "@/components/EmailPanel";
import type { Mailbox, Message, FullMessage } from "@/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function CustomerEmails() {
  const { email } = useParams<{ email: string }>();
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [activeMailbox, setActiveMailbox] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeMessage, setActiveMessage] = useState<FullMessage | null>(null);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [loadingBody, setLoadingBody] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadMailboxes() {
    setLoading(true);
    try {
      const data = await api.get<{ mailboxes: Mailbox[] }>(
        `/api/admin/customer-emails/${encodeURIComponent(email!)}/mailboxes`
      );
      setMailboxes(data.mailboxes);
      if (data.mailboxes.length > 0) {
        const inbox = data.mailboxes.find((m) => m.name.toLowerCase() === "inbox") || data.mailboxes[0];
        setActiveMailbox(inbox.id);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load mailboxes");
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages(mailboxId: string) {
    setLoadingMsgs(true);
    setActiveMessage(null);
    try {
      const data = await api.get<{ data: Message[] }>(
        `/api/admin/customer-emails/${encodeURIComponent(email!)}/mailboxes/${mailboxId}/messages?per_page=100`
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
        `/api/admin/customer-emails/${encodeURIComponent(email!)}/mailboxes/${activeMailbox}/messages/${messageId}`
      );
      setActiveMessage(msg);
    } catch {
      setActiveMessage(null);
    } finally {
      setLoadingBody(false);
    }
  }

  useEffect(() => { loadMailboxes(); }, [email]);
  useEffect(() => { if (activeMailbox) loadMessages(activeMailbox); }, [activeMailbox]);

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-dd-red-lighter text-dd-red-active rounded-dd p-4 text-sm">{error}</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-[calc(100svh-4rem)] flex flex-col">
        <div className="px-6 py-4 border-b border-dd-200 bg-white flex-shrink-0 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="flex flex-1 overflow-hidden">
          <div className="w-52 flex-shrink-0 border-r border-dd-200 p-3 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
          <div className="w-80 flex-shrink-0 border-r border-dd-200 p-3 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
          <div className="flex-1 p-5 space-y-4">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100svh-4rem)] flex flex-col">
      <div className="px-6 py-4 border-b border-dd-200 bg-white flex-shrink-0">
        <Button variant="link" asChild className="p-0 h-auto text-primary">
          <Link to={`/accounts/${encodeURIComponent(email!)}`}>
            <ArrowLeft className="h-4 w-4" />
            Back to Account
          </Link>
        </Button>
        <h1 className="text-xl font-bold text-dd-950 mt-1">Emails: {email}</h1>
      </div>

      <EmailPanel
        mailboxes={mailboxes}
        activeMailbox={activeMailbox}
        onSelectMailbox={setActiveMailbox}
        messages={messages}
        loadingMsgs={loadingMsgs}
        activeMessage={activeMessage}
        loadingBody={loadingBody}
        onSelectMessage={loadMessage}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onClearMessage={() => setActiveMessage(null)}
        attachmentBaseUrl={`/api/admin/customer-emails/${encodeURIComponent(email!)}`}
      />
    </div>
  );
}
