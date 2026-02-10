import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import EmailPanel from "../../components/EmailPanel";

interface Account {
  id: string;
  email: string;
  customer_name: string | null;
  stage: string;
}

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

const STAGE_COLORS: Record<string, string> = {
  REGISTERED: "bg-gray-400",
  IDENTITY_VERIFIED: "bg-blue-400",
  BGC_PENDING: "bg-yellow-400",
  BGC_CLEAR: "bg-green-400",
  BGC_CONSIDER: "bg-orange-400",
  ACTIVE: "bg-emerald-500",
  DEACTIVATED: "bg-red-400",
};

export default function AllEmails() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [searchCustomer, setSearchCustomer] = useState("");
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [activeMailbox, setActiveMailbox] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeMessage, setActiveMessage] = useState<FullMessage | null>(null);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [loadingBody, setLoadingBody] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  async function loadAccounts() {
    setLoadingAccounts(true);
    try {
      const data = await api.get<{ accounts: Account[] }>(
        "/api/dashboard/accounts?per_page=200"
      );
      setAccounts(data.accounts);
    } catch {
      setAccounts([]);
    } finally {
      setLoadingAccounts(false);
    }
  }

  async function selectAccount(email: string) {
    setSelectedEmail(email);
    setMailboxes([]);
    setMessages([]);
    setActiveMessage(null);
    setActiveMailbox(null);
    setSearchQuery("");
    try {
      const data = await api.get<{ mailboxes: Mailbox[] }>(
        `/api/admin/customer-emails/${encodeURIComponent(email)}/mailboxes`
      );
      setMailboxes(data.mailboxes);
      if (data.mailboxes.length > 0) {
        const inbox =
          data.mailboxes.find((m) => m.name.toLowerCase() === "inbox") ||
          data.mailboxes[0];
        setActiveMailbox(inbox.id);
      }
    } catch {
      setMailboxes([]);
    }
  }

  async function loadMessages(mailboxId: string) {
    if (!selectedEmail) return;
    setLoadingMsgs(true);
    setActiveMessage(null);
    try {
      const data = await api.get<{ data: Message[] }>(
        `/api/admin/customer-emails/${encodeURIComponent(selectedEmail)}/mailboxes/${mailboxId}/messages?per_page=100`
      );
      setMessages(data.data || []);
    } catch {
      setMessages([]);
    } finally {
      setLoadingMsgs(false);
    }
  }

  async function loadMessage(messageId: string) {
    if (!selectedEmail || !activeMailbox) return;
    setLoadingBody(true);
    try {
      const msg = await api.get<FullMessage>(
        `/api/admin/customer-emails/${encodeURIComponent(selectedEmail)}/mailboxes/${activeMailbox}/messages/${messageId}`
      );
      setActiveMessage(msg);
    } catch {
      setActiveMessage(null);
    } finally {
      setLoadingBody(false);
    }
  }

  useEffect(() => {
    loadAccounts();
  }, []);

  useEffect(() => {
    if (activeMailbox) loadMessages(activeMailbox);
  }, [activeMailbox]);

  const filteredAccounts = searchCustomer
    ? accounts.filter(
        (a) =>
          a.email.toLowerCase().includes(searchCustomer.toLowerCase()) ||
          (a.customer_name || "").toLowerCase().includes(searchCustomer.toLowerCase())
      )
    : accounts;

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b flex-shrink-0">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-blue-600 hover:underline text-sm">
              &larr; Dashboard
            </Link>
            <h1 className="text-lg font-bold text-gray-800">All Customer Emails</h1>
            <span className="text-sm text-gray-400">{accounts.length} accounts</span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Customer List Sidebar */}
        <div className="w-64 bg-white border-r flex-shrink-0 flex flex-col">
          {/* Search */}
          <div className="px-3 py-2 border-b">
            <input
              type="text"
              placeholder="Search customer..."
              value={searchCustomer}
              onChange={(e) => setSearchCustomer(e.target.value)}
              className="w-full px-3 py-1.5 bg-gray-100 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          {/* Account List */}
          <div className="flex-1 overflow-y-auto">
            {loadingAccounts ? (
              <div className="p-4 text-gray-400 text-sm">Loading...</div>
            ) : filteredAccounts.length === 0 ? (
              <div className="p-4 text-gray-400 text-sm">No accounts found</div>
            ) : (
              filteredAccounts.map((acc) => (
                <button
                  key={acc.id}
                  onClick={() => selectAccount(acc.email)}
                  className={`w-full text-left px-3 py-2.5 border-b hover:bg-gray-50 transition ${
                    selectedEmail === acc.email ? "bg-blue-50 border-l-2 border-l-blue-500" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${STAGE_COLORS[acc.stage] || "bg-gray-300"}`}
                      title={acc.stage}
                    />
                    <span className="text-sm text-gray-800 truncate">
                      {acc.email.split("@")[0]}
                    </span>
                  </div>
                  {acc.customer_name && (
                    <div className="text-[10px] text-gray-400 mt-0.5 ml-4 truncate">
                      {acc.customer_name}
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Email Panel */}
        {selectedEmail ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-4 py-2 bg-gray-100 border-b flex-shrink-0 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">{selectedEmail}</span>
              <Link
                to={`/accounts/${encodeURIComponent(selectedEmail)}`}
                className="text-xs text-blue-600 hover:underline"
              >
                View Account
              </Link>
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
            />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            Select a customer to view their emails
          </div>
        )}
      </div>
    </div>
  );
}
