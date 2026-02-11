import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { useSSE } from "../../hooks/useSSE";
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

interface Attachment {
  id: string;
  filename: string;
  contentType?: string;
  size?: number;
}

interface FullMessage extends Message {
  html?: string;
  text?: string;
  to?: string;
  attachments?: Attachment[];
}

export default function Inbox() {
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [activeMailbox, setActiveMailbox] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeMessage, setActiveMessage] = useState<FullMessage | null>(null);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [loadingBody, setLoadingBody] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [newMailCount, setNewMailCount] = useState(0);
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdError, setPwdError] = useState("");
  const [pwdSuccess, setPwdSuccess] = useState(false);
  const [changingPwd, setChangingPwd] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const navigate = useNavigate();

  const token = localStorage.getItem("portal_token");

  // SSE for real-time notifications
  useSSE({
    endpoint: "/api/sse/portal/events",
    token,
    enabled: !!token,
    onEvent: {
      new_email: () => {
        setNewMailCount((c) => c + 1);
        if (activeMailbox) loadMessages(activeMailbox);
      },
      stage_change: () => {},
    },
  });

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
    setNewMailCount(0);
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

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdError("");
    setPwdSuccess(false);
    if (newPwd !== confirmPwd) {
      setPwdError("Passwords do not match");
      return;
    }
    if (newPwd.length < 6) {
      setPwdError("Password must be at least 6 characters");
      return;
    }
    setChangingPwd(true);
    try {
      await api.post("/api/portal/change-password", {
        current_password: currentPwd,
        new_password: newPwd,
      });
      setPwdSuccess(true);
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
      setTimeout(() => {
        setShowChangePwd(false);
        setPwdSuccess(false);
      }, 2000);
    } catch (err: unknown) {
      setPwdError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setChangingPwd(false);
    }
  }

  function logout() {
    localStorage.removeItem("portal_token");
    localStorage.removeItem("portal_refresh_token");
    navigate("/login");
  }

  useEffect(() => {
    loadMailboxes();
  }, []);

  useEffect(() => {
    if (activeMailbox) loadMessages(activeMailbox);
  }, [activeMailbox]);

  // Get user email from token
  let userEmail = "";
  try {
    const payload = JSON.parse(atob(token?.split(".")[1] || ""));
    userEmail = payload.sub || "";
  } catch {
    // ignore
  }

  return (
    <div className="h-screen flex flex-col bg-dd-100">
      {/* Header */}
      <header className="bg-white border-b border-dd-200 flex-shrink-0">
        <div className="px-4 sm:px-6 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-dd-red rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">D</span>
            </div>
            <h1 className="text-lg font-bold text-dd-950 hidden sm:block">DasherHelp Mail</h1>
            {newMailCount > 0 && (
              <span className="bg-dd-red text-white text-[10px] font-bold rounded-full px-2 py-0.5">
                {newMailCount} new
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 relative">
            <span className="text-sm text-dd-600 hidden sm:block">{userEmail}</span>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="w-8 h-8 bg-dd-200 rounded-full flex items-center justify-center hover:bg-dd-300 transition-colors"
            >
              <svg className="w-4 h-4 text-dd-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </button>
            {showUserMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                <div className="absolute right-0 top-10 bg-white rounded-dd shadow-dd-lg border border-dd-200 py-1 z-50 w-48">
                  <div className="px-4 py-2 border-b border-dd-200">
                    <div className="text-sm font-medium text-dd-950 truncate">{userEmail}</div>
                  </div>
                  <button
                    onClick={() => { setShowChangePwd(true); setShowUserMenu(false); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-dd-800 hover:bg-dd-50 transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                    Change Password
                  </button>
                  <button
                    onClick={logout}
                    className="w-full text-left px-4 py-2.5 text-sm text-dd-red hover:bg-dd-red-light transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Sign Out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Email Panel */}
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
        newMailCount={newMailCount}
        onClearMessage={() => setActiveMessage(null)}
        attachmentBaseUrl="/api/portal"
      />

      {/* Change Password Modal */}
      {showChangePwd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-dd shadow-dd-lg p-6 w-full max-w-sm mx-4">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-dd-950">Change Password</h2>
              <button
                onClick={() => { setShowChangePwd(false); setPwdError(""); setPwdSuccess(false); }}
                className="text-dd-500 hover:text-dd-950 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {pwdSuccess ? (
              <div className="bg-[#E5F9EB] text-[#004C1B] p-4 rounded-dd text-sm font-medium border border-green-200 text-center">
                Password changed successfully!
              </div>
            ) : (
              <form onSubmit={changePassword} className="space-y-4">
                {pwdError && (
                  <div className="bg-dd-red-lighter text-dd-red-active p-3 rounded-dd text-sm font-medium border border-dd-red/20">
                    {pwdError}
                  </div>
                )}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-dd-950">Current Password</label>
                  <input
                    type="password"
                    value={currentPwd}
                    onChange={(e) => setCurrentPwd(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 border border-dd-400 rounded-lg text-sm text-dd-950 focus:border-dd-red focus:ring-2 focus:ring-dd-red/20 focus:outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-dd-950">New Password</label>
                  <input
                    type="password"
                    value={newPwd}
                    onChange={(e) => setNewPwd(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 border border-dd-400 rounded-lg text-sm text-dd-950 focus:border-dd-red focus:ring-2 focus:ring-dd-red/20 focus:outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-dd-950">Confirm New Password</label>
                  <input
                    type="password"
                    value={confirmPwd}
                    onChange={(e) => setConfirmPwd(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 border border-dd-400 rounded-lg text-sm text-dd-950 focus:border-dd-red focus:ring-2 focus:ring-dd-red/20 focus:outline-none"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={changingPwd}
                    className="flex-1 bg-dd-red text-white py-2.5 rounded-dd-pill font-semibold hover:bg-dd-red-hover disabled:opacity-50 transition-colors"
                  >
                    {changingPwd ? "Changing..." : "Change Password"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowChangePwd(false); setPwdError(""); }}
                    className="px-5 py-2.5 border border-dd-950 text-dd-950 rounded-dd-pill font-semibold hover:bg-dd-100 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
                <p className="text-xs text-dd-500 text-center">
                  This will also update your email account password.
                </p>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
