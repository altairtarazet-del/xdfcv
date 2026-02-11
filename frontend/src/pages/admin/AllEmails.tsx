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
  REGISTERED: "bg-dd-500",
  IDENTITY_VERIFIED: "bg-blue-500",
  BGC_PENDING: "bg-yellow-500",
  BGC_CLEAR: "bg-green-500",
  BGC_CONSIDER: "bg-orange-500",
  ACTIVE: "bg-emerald-500",
  DEACTIVATED: "bg-dd-red",
};

const STAGE_LABELS: Record<string, string> = {
  REGISTERED: "Registered",
  IDENTITY_VERIFIED: "ID Verified",
  BGC_PENDING: "BGC Pending",
  BGC_CLEAR: "BGC Clear",
  BGC_CONSIDER: "BGC Consider",
  ACTIVE: "Active",
  DEACTIVATED: "Deactivated",
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
      const data = await api.get<{ accounts: Account[] }>("/api/dashboard/accounts?per_page=200");
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
        const inbox = data.mailboxes.find((m) => m.name.toLowerCase() === "inbox") || data.mailboxes[0];
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

  useEffect(() => { loadAccounts(); }, []);
  useEffect(() => { if (activeMailbox) loadMessages(activeMailbox); }, [activeMailbox]);

  const filteredAccounts = searchCustomer
    ? accounts.filter(
        (a) =>
          a.email.toLowerCase().includes(searchCustomer.toLowerCase()) ||
          (a.customer_name || "").toLowerCase().includes(searchCustomer.toLowerCase())
      )
    : accounts;

  return (
    <div className="h-full flex flex-col">
      {/* Page Header */}
      <div className="px-6 py-4 border-b border-dd-200 bg-white flex-shrink-0">
        <h1 className="text-xl font-bold text-dd-950">All Emails</h1>
        <p className="text-sm text-dd-600 mt-0.5">{accounts.length} customer accounts</p>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Account Sidebar */}
        <div className="w-72 bg-white border-r border-dd-200 flex-shrink-0 flex flex-col">
          {/* Search */}
          <div className="px-3 py-3 border-b border-dd-200">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dd-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search customer..."
                value={searchCustomer}
                onChange={(e) => setSearchCustomer(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-dd-100 rounded-lg text-sm text-dd-950 placeholder:text-dd-500 focus:ring-2 focus:ring-dd-red/20 focus:outline-none border border-transparent focus:border-dd-red/30"
              />
            </div>
          </div>

          {/* Account List */}
          <div className="flex-1 overflow-y-auto">
            {loadingAccounts ? (
              <div className="p-4 text-dd-500 text-sm">Loading...</div>
            ) : filteredAccounts.length === 0 ? (
              <div className="p-4 text-dd-500 text-sm">No accounts found</div>
            ) : (
              filteredAccounts.map((acc) => (
                <button
                  key={acc.id}
                  onClick={() => selectAccount(acc.email)}
                  className={`w-full text-left px-4 py-3 border-b border-dd-200 hover:bg-dd-50 transition-colors ${
                    selectedEmail === acc.email
                      ? "bg-dd-red-light border-l-[3px] border-l-dd-red pl-[13px]"
                      : ""
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${STAGE_COLORS[acc.stage] || "bg-dd-400"}`}
                      title={STAGE_LABELS[acc.stage] || acc.stage}
                    />
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm truncate ${selectedEmail === acc.email ? "text-dd-red font-semibold" : "text-dd-950 font-medium"}`}>
                        {acc.email.split("@")[0]}
                      </div>
                      <div className="text-[11px] text-dd-600 mt-0.5">
                        {STAGE_LABELS[acc.stage] || acc.stage}
                        {acc.customer_name && ` · ${acc.customer_name}`}
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Email Viewer */}
        {selectedEmail ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Selected account bar */}
            <div className="px-4 py-2.5 bg-dd-50 border-b border-dd-200 flex-shrink-0 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-dd-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span className="text-sm font-medium text-dd-950">{selectedEmail}</span>
              </div>
              <Link
                to={`/accounts/${encodeURIComponent(selectedEmail)}`}
                className="text-xs font-medium text-dd-red hover:text-dd-red-hover transition-colors"
              >
                View Account →
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
              onClearMessage={() => setActiveMessage(null)}
            />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-dd-50">
            <div className="text-center">
              <svg className="w-16 h-16 text-dd-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <p className="text-dd-600 font-medium">Select a customer</p>
              <p className="text-sm text-dd-500 mt-1">Choose an account from the left to view their emails</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
