import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../../api/client";
import EmailPanel from "../../components/EmailPanel";

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

export default function CustomerEmails() {
  const { email } = useParams<{ email: string }>();
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [activeMailbox, setActiveMailbox] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeMessage, setActiveMessage] = useState<FullMessage | null>(null);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [loadingBody, setLoadingBody] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState("");

  async function loadMailboxes() {
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

  useEffect(() => {
    loadMailboxes();
  }, [email]);

  useEffect(() => {
    if (activeMailbox) loadMessages(activeMailbox);
  }, [activeMailbox]);

  if (error) return <div className="p-8 text-red-600">{error}</div>;

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <header className="bg-white shadow-sm border-b flex-shrink-0">
        <div className="px-4 py-3 flex items-center gap-4">
          <Link to={`/accounts/${encodeURIComponent(email!)}`} className="text-blue-600 hover:underline text-sm">
            &larr; Account
          </Link>
          <h1 className="text-lg font-bold text-gray-800">Emails: {email}</h1>
        </div>
      </header>

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
      />
    </div>
  );
}
