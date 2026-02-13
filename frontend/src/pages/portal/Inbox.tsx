import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { User, LogOut, KeyRound, Mail, Bell, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api/client";
import { useSSE } from "@/hooks/useSSE";
import EmailPanel from "@/components/EmailPanel";
import type { Mailbox, Message, FullMessage } from "@/types";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

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
  const [changingPwd, setChangingPwd] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const navigate = useNavigate();

  const token = localStorage.getItem("portal_token");

  // Get user email from token
  let userEmail = "";
  try {
    const payload = JSON.parse(atob(token?.split(".")[1] || ""));
    userEmail = payload.sub || "";
  } catch {
    // ignore
  }

  const userInitial = userEmail ? userEmail.charAt(0).toUpperCase() : "U";

  // SSE for real-time notifications
  useSSE({
    endpoint: "/api/sse/portal/events",
    token,
    enabled: !!token,
    onEvent: {
      new_email: () => {
        setNewMailCount((c) => c + 1);
        toast("New email received", {
          description: "You have a new message in your inbox.",
          icon: <Bell className="h-4 w-4" />,
        });
        if (activeMailbox) loadMessages(activeMailbox);
      },
      stage_change: () => {},
    },
  });

  const loadMailboxes = useCallback(async () => {
    try {
      const data = await api.get<{ mailboxes: Mailbox[] }>("/api/portal/mailboxes");
      setMailboxes(data.mailboxes);
      if (data.mailboxes.length > 0) {
        const inbox =
          data.mailboxes.find((m) => m.name.toLowerCase() === "inbox") || data.mailboxes[0];
        setActiveMailbox(inbox.id);
      }
    } catch {
      // Error handled by API client (401 redirect)
    } finally {
      setInitialLoading(false);
    }
  }, []);

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
      toast.success("Password changed successfully");
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
      setShowChangePwd(false);
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
  }, [loadMailboxes]);

  useEffect(() => {
    if (activeMailbox) loadMessages(activeMailbox);
  }, [activeMailbox]);

  if (initialLoading) {
    return (
      <div className="h-screen flex flex-col bg-dd-100">
        <Card className="rounded-none border-x-0 border-t-0 flex-shrink-0">
          <div className="px-4 sm:px-6 py-3 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-5 w-32 hidden sm:block" />
            </div>
            <div className="flex items-center gap-3">
              <Skeleton className="h-4 w-40 hidden sm:block" />
              <Skeleton className="h-8 w-8 rounded-full" />
            </div>
          </div>
        </Card>
        <div className="flex flex-1 overflow-hidden">
          <div className="w-52 flex-shrink-0 hidden md:flex flex-col border-r border-dd-200 bg-white p-3 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
          <div className="w-80 flex-shrink-0 bg-white border-r border-dd-200 p-3 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
          <div className="flex-1 bg-white flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-dd-400" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-dd-100">
      {/* Header */}
      <Card className="rounded-none border-x-0 border-t-0 flex-shrink-0">
        <div className="px-4 sm:px-6 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-dd-red rounded-lg flex items-center justify-center">
              <Mail className="h-4 w-4 text-white" />
            </div>
            <h1 className="text-lg font-bold text-dd-950 hidden sm:block">DasherHelp Mail</h1>
            {newMailCount > 0 && (
              <span className="bg-dd-red text-white text-[10px] font-bold rounded-full px-2 py-0.5 flex items-center gap-1">
                <Bell className="h-3 w-3" />
                {newMailCount} new
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-dd-600 hidden sm:block">{userEmail}</span>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 rounded-full p-0">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-dd-200 text-dd-700 text-sm font-medium">
                      {userInitial}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-dd-500" />
                    <span className="text-sm font-medium text-dd-950 truncate">{userEmail}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowChangePwd(true)}>
                  <KeyRound className="h-4 w-4" />
                  Change Password
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="text-dd-red focus:text-dd-red">
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </Card>

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

      {/* Change Password Dialog */}
      <Dialog
        open={showChangePwd}
        onOpenChange={(open) => {
          setShowChangePwd(open);
          if (!open) {
            setPwdError("");
            setCurrentPwd("");
            setNewPwd("");
            setConfirmPwd("");
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>
              This will also update your email account password.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={changePassword} className="space-y-4">
            {pwdError && (
              <div className="bg-dd-red-lighter text-dd-red-active p-3 rounded-md text-sm font-medium border border-dd-red/20">
                {pwdError}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="current-password">Current Password</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPwd}
                onChange={(e) => setCurrentPwd(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm New Password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                required
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowChangePwd(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={changingPwd} className="bg-dd-red hover:bg-dd-red-hover">
                {changingPwd && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {changingPwd ? "Changing..." : "Change Password"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
