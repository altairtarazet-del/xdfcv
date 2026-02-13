import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Users, Inbox } from "lucide-react";
import type { Account, Mailbox, Message, FullMessage } from "@/types";
import { STAGE_MAP, STAGE_BADGE } from "@/types";
import { api } from "@/api/client";
import EmailPanel from "@/components/EmailPanel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

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
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-dd-600" />
          <h1 className="text-xl font-bold text-dd-950">All Emails</h1>
        </div>
        <p className="text-sm text-dd-600 mt-0.5">{accounts.length} customer accounts</p>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Account Sidebar */}
        <div className="w-72 bg-white border-r border-dd-200 flex-shrink-0 flex flex-col">
          {/* Search */}
          <div className="px-3 py-3 border-b border-dd-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dd-500" />
              <Input
                type="text"
                placeholder="Search customer..."
                value={searchCustomer}
                onChange={(e) => setSearchCustomer(e.target.value)}
                className="pl-9 h-9 bg-dd-100 border-transparent focus-visible:ring-dd-red/20 focus-visible:border-dd-red/30 text-sm"
              />
            </div>
          </div>

          {/* Account List */}
          <ScrollArea className="flex-1">
            {loadingAccounts ? (
              <div className="p-3 space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="p-3 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                ))}
              </div>
            ) : filteredAccounts.length === 0 ? (
              <div className="p-6 text-center">
                <Users className="h-8 w-8 text-dd-300 mx-auto mb-2" />
                <p className="text-sm text-dd-500">No accounts found</p>
              </div>
            ) : (
              filteredAccounts.map((acc) => {
                const isActive = selectedEmail === acc.email;
                const stageInfo = STAGE_MAP[acc.stage];
                return (
                  <Card
                    key={acc.id}
                    onClick={() => selectAccount(acc.email)}
                    className={`cursor-pointer rounded-none border-x-0 border-t-0 border-b border-dd-200 shadow-none transition-colors ${
                      isActive
                        ? "bg-dd-red-light border-l-[3px] border-l-dd-red pl-[13px]"
                        : "hover:bg-dd-50"
                    }`}
                  >
                    <div className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="min-w-0 flex-1">
                          <div className={`text-sm truncate ${isActive ? "text-dd-red font-semibold" : "text-dd-950 font-medium"}`}>
                            {acc.email.split("@")[0]}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            <Badge
                              variant="secondary"
                              className={`text-[10px] px-1.5 py-0 font-medium border-0 ${
                                STAGE_BADGE[acc.stage] || "bg-dd-200 text-dd-700"
                              }`}
                            >
                              {stageInfo?.label || acc.stage}
                            </Badge>
                            {acc.customer_name && (
                              <span className="text-[11px] text-dd-600 truncate">
                                {acc.customer_name}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })
            )}
          </ScrollArea>
        </div>

        {/* Email Viewer */}
        {selectedEmail ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Selected account bar */}
            <div className="px-4 py-2.5 bg-dd-50 border-b border-dd-200 flex-shrink-0 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Inbox className="w-4 h-4 text-dd-600" />
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
              attachmentBaseUrl={selectedEmail ? `/api/admin/customer-emails/${encodeURIComponent(selectedEmail)}` : undefined}
            />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-dd-50">
            <div className="text-center">
              <Inbox className="w-16 h-16 text-dd-300 mx-auto mb-4" />
              <p className="text-dd-600 font-medium">Select a customer</p>
              <p className="text-sm text-dd-500 mt-1">Choose an account from the left to view their emails</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
