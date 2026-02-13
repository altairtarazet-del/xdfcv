import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Bell,
  Search,
  Loader2,
  UserCheck,
  ShieldCheck,
  Clock,
  CheckCircle2,
  XCircle,
  Zap,
  UserX,
  AlertCircle,
  Archive,
  Pause,
  Play,
} from "lucide-react";
import { api } from "@/api/client";
import { useSSE } from "@/hooks/useSSE";
import type { Stats, Account, Alert } from "@/types";
import { STAGE_MAP, STAGES, STAGE_BADGE, STATUS_BADGE } from "@/types";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const STAGE_ICONS: Record<string, React.ReactNode> = {
  REGISTERED: <UserCheck className="h-4 w-4" />,
  IDENTITY_VERIFIED: <ShieldCheck className="h-4 w-4" />,
  BGC_PENDING: <Clock className="h-4 w-4" />,
  BGC_CLEAR: <CheckCircle2 className="h-4 w-4" />,
  BGC_CONSIDER: <AlertCircle className="h-4 w-4" />,
  ACTIVE: <Zap className="h-4 w-4" />,
  DEACTIVATED: <UserX className="h-4 w-4" />,
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-destructive",
  warning: "bg-yellow-500",
  info: "bg-blue-500",
};

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [total, setTotal] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<{
    scanned: number;
    total: number;
    errors: number;
    transitions: number;
    current_account: string;
    status: string;
  } | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState<{
    action: string;
    label: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const stage = searchParams.get("stage") || "";
  const search = searchParams.get("search") || "";
  const page = parseInt(searchParams.get("page") || "1");

  const token = localStorage.getItem("admin_token");
  const adminRole = localStorage.getItem("admin_role") || "admin";
  const isRestricted = adminRole === "operator" || adminRole === "viewer";
  const isViewer = adminRole === "viewer";

  // SSE for real-time updates
  useSSE({
    endpoint: "/api/sse/admin/events",
    token,
    enabled: !!token,
    onEvent: {
      new_email: () => {
        loadStats();
        loadAccounts();
      },
      stage_change: () => {
        loadStats();
        loadAccounts();
      },
      alert: () => {
        loadStats();
        loadAlerts();
      },
    },
  });

  async function loadStats() {
    const data = await api.get<Stats>("/api/dashboard/stats");
    setStats(data);
  }

  async function loadAccounts() {
    const params = new URLSearchParams();
    if (stage) params.set("stage", stage);
    if (search) params.set("search", search);
    params.set("page", String(page));
    const data = await api.get<{ accounts: Account[]; total: number }>(
      `/api/dashboard/accounts?${params}`
    );
    setAccounts(data.accounts);
    setTotal(data.total);
  }

  async function loadAlerts() {
    const data = await api.get<{ alerts: Alert[] }>(
      "/api/dashboard/alerts?unread_only=true&per_page=10"
    );
    setAlerts(data.alerts);
  }

  async function markAlertRead(alertId: number) {
    await api.patch(`/api/dashboard/alerts/${alertId}/read`, {});
    loadAlerts();
    loadStats();
  }

  async function markAllRead() {
    await api.post("/api/dashboard/alerts/mark-all-read");
    setAlerts([]);
    loadStats();
  }

  async function startScan() {
    setScanning(true);
    setScanProgress({
      scanned: 0,
      total: 0,
      errors: 0,
      transitions: 0,
      current_account: "",
      status: "running",
    });
    try {
      const data = await api.post<{ scan_id: number }>("/api/scan");
      const scanId = data.scan_id;
      const poll = setInterval(async () => {
        const s = await api.get<{
          status: string;
          scanned: number;
          errors: number;
          transitions: number;
          total_accounts: number;
          current_account: string;
        }>(`/api/scan/${scanId}`);
        setScanProgress({
          scanned: s.scanned,
          total: s.total_accounts || 0,
          errors: s.errors,
          transitions: s.transitions,
          current_account: s.current_account || "",
          status: s.status,
        });
        if (s.status !== "running") {
          clearInterval(poll);
          setTimeout(() => {
            setScanning(false);
            setScanProgress(null);
            loadStats();
            loadAccounts();
          }, 3000);
        }
      }, 1000);
    } catch {
      setScanning(false);
      setScanProgress(null);
    }
  }

  async function executeBulkAction(action: string) {
    if (selectedIds.size === 0) return;
    await api.post("/api/dashboard/bulk-action", {
      account_ids: Array.from(selectedIds),
      action,
    });
    setSelectedIds(new Set());
    setBulkConfirm(null);
    loadAccounts();
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === accounts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(accounts.map((a) => a.id)));
    }
  }

  useEffect(() => {
    Promise.all([loadStats(), loadAlerts()]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [stage, search, page]);

  const totalPages = Math.ceil(total / 50);
  const progressPercent =
    scanProgress && scanProgress.total > 0
      ? Math.max(2, (scanProgress.scanned / scanProgress.total) * 100)
      : 5;

  // Loading skeleton
  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor dasher accounts, run scans, and manage onboarding stages.
          </p>
        </div>

        {/* Alert Bell Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              {(stats?.unread_alerts || 0) > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                  {stats!.unread_alerts > 99 ? "99+" : stats!.unread_alerts}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="text-sm font-semibold">Alerts</span>
              {alerts.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto px-2 py-1 text-xs text-primary"
                  onClick={markAllRead}
                >
                  Mark all read
                </Button>
              )}
            </div>
            <DropdownMenuSeparator />
            {alerts.length === 0 ? (
              <div className="px-4 py-6 text-center text-muted-foreground text-sm">
                No unread alerts
              </div>
            ) : (
              alerts.map((a) => (
                <DropdownMenuItem
                  key={a.id}
                  onClick={() => markAlertRead(a.id)}
                  className="flex gap-3 items-start cursor-pointer py-2.5"
                >
                  <span
                    className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${SEVERITY_STYLES[a.severity] || "bg-muted-foreground"}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{a.title}</div>
                    {a.message && (
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">
                        {a.message}
                      </div>
                    )}
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {new Date(a.created_at).toLocaleString()}
                    </div>
                  </div>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Stage Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {STAGES.map((s) => {
            const isActive = stage === s;
            return (
              <Card
                key={s}
                className={`cursor-pointer transition-all hover:shadow-md ${
                  isActive
                    ? "ring-2 ring-primary shadow-md"
                    : "hover:ring-1 hover:ring-border"
                }`}
                onClick={() =>
                  setSearchParams(stage === s ? {} : { stage: s })
                }
              >
                <CardContent className="p-4 text-center">
                  <div className="flex justify-center mb-2 text-muted-foreground">
                    {STAGE_ICONS[s]}
                  </div>
                  <div className="text-2xl font-bold">
                    {stats.stage_counts[s] || 0}
                  </div>
                  <div className="text-xs font-medium text-muted-foreground mt-1">
                    {STAGE_MAP[s].label}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Scan Controls */}
      {!isViewer && (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {stats?.last_scan && !scanning ? (
                  <>
                    Last scan:{" "}
                    {new Date(stats.last_scan.started_at).toLocaleString()} —{" "}
                    <span
                      className={`font-medium ${
                        stats.last_scan.status === "completed"
                          ? "text-emerald-600"
                          : stats.last_scan.status === "failed"
                            ? "text-destructive"
                            : "text-foreground"
                      }`}
                    >
                      {stats.last_scan.status}
                    </span>{" "}
                    ({stats.last_scan.scanned} scanned,{" "}
                    {stats.last_scan.transitions} transitions)
                  </>
                ) : !scanning ? (
                  "No scans yet"
                ) : null}
                {scanning && scanProgress && (
                  <span className="font-medium text-foreground">
                    {scanProgress.status === "running"
                      ? scanProgress.total > 0
                        ? `Scanning accounts... ${scanProgress.scanned}/${scanProgress.total}`
                        : "Syncing SMTP accounts..."
                      : scanProgress.status === "completed"
                        ? "Scan completed!"
                        : "Scan failed"}
                  </span>
                )}
              </div>
              <Button onClick={startScan} disabled={scanning}>
                {scanning && <Loader2 className="animate-spin" />}
                {scanning ? "Scanning..." : "Scan All"}
              </Button>
            </div>

            {/* Progress Bar */}
            {scanning && scanProgress && (
              <div className="mt-4 space-y-3">
                <div className="relative h-3 bg-secondary rounded-full overflow-hidden">
                  <div
                    className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-out ${
                      scanProgress.status === "completed"
                        ? "bg-emerald-500"
                        : "bg-primary"
                    }`}
                    style={{ width: `${progressPercent}%` }}
                  />
                  {scanProgress.status === "running" && (
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_1.5s_infinite]" />
                  )}
                </div>

                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="text-muted-foreground">Scanned</span>
                      <span className="font-bold">
                        {scanProgress.scanned}
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      <span className="text-muted-foreground">
                        Transitions
                      </span>
                      <span className="font-bold">
                        {scanProgress.transitions}
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-destructive" />
                      <span className="text-muted-foreground">Errors</span>
                      <span className="font-bold">{scanProgress.errors}</span>
                    </span>
                  </div>
                  {scanProgress.current_account &&
                    scanProgress.status === "running" && (
                      <span className="text-muted-foreground truncate max-w-[200px]">
                        {scanProgress.current_account}
                      </span>
                    )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Search + Bulk Actions */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search by email..."
            defaultValue={search}
            className="pl-10"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const val = (e.target as HTMLInputElement).value;
                const p: Record<string, string> = {};
                if (val) p.search = val;
                if (stage) p.stage = stage;
                setSearchParams(p);
              }
            }}
          />
        </div>
        <span className="text-sm text-muted-foreground font-medium">
          {total} accounts
        </span>
        {!isRestricted && selectedIds.size > 0 && (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                setBulkConfirm({ action: "archive", label: "Archive" })
              }
            >
              <Archive className="h-3.5 w-3.5" />
              Archive ({selectedIds.size})
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setBulkConfirm({ action: "suspend", label: "Suspend" })
              }
            >
              <Pause className="h-3.5 w-3.5" />
              Suspend
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setBulkConfirm({ action: "activate", label: "Activate" })
              }
            >
              <Play className="h-3.5 w-3.5" />
              Activate
            </Button>
          </div>
        )}
      </div>

      {/* Accounts Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              {!isRestricted && (
                <TableHead className="w-8">
                  <input
                    type="checkbox"
                    checked={
                      accounts.length > 0 &&
                      selectedIds.size === accounts.length
                    }
                    onChange={toggleSelectAll}
                    className="rounded accent-primary"
                  />
                </TableHead>
              )}
              <TableHead>Email</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Stage Updated</TableHead>
              <TableHead>Error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((acc) => (
              <TableRow key={acc.id}>
                {!isRestricted && (
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(acc.id)}
                      onChange={() => toggleSelect(acc.id)}
                      className="rounded accent-primary"
                    />
                  </TableCell>
                )}
                <TableCell>
                  <Link
                    to={`/accounts/${encodeURIComponent(acc.email)}`}
                    className="text-primary hover:text-primary/80 font-medium hover:underline"
                  >
                    {acc.email}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {acc.first_name && acc.last_name
                    ? `${acc.first_name} ${acc.last_name}`
                    : acc.customer_name || "\u2014"}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    className={STAGE_BADGE[acc.stage] || ""}
                  >
                    {STAGE_MAP[acc.stage]?.label || acc.stage}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    className={STATUS_BADGE[acc.status] || ""}
                  >
                    {acc.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {acc.stage_updated_at
                    ? new Date(acc.stage_updated_at).toLocaleString()
                    : "\u2014"}
                </TableCell>
                <TableCell className="text-destructive max-w-xs truncate text-sm">
                  {acc.scan_error || ""}
                </TableCell>
              </TableRow>
            ))}
            {accounts.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={isRestricted ? 6 : 7}
                  className="h-24 text-center text-muted-foreground"
                >
                  No accounts found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-1">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Button
              key={p}
              variant={p === page ? "default" : "outline"}
              size="sm"
              onClick={() => {
                const params: Record<string, string> = { page: String(p) };
                if (stage) params.stage = stage;
                if (search) params.search = search;
                setSearchParams(params);
              }}
            >
              {p}
            </Button>
          ))}
        </div>
      )}

      {/* Bulk Action Confirmation Dialog */}
      <Dialog
        open={!!bulkConfirm}
        onOpenChange={(open) => !open && setBulkConfirm(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm {bulkConfirm?.label}</DialogTitle>
            <DialogDescription>
              Are you sure you want to {bulkConfirm?.action}{" "}
              {selectedIds.size} selected account
              {selectedIds.size > 1 ? "s" : ""}? This action cannot be easily
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant={
                bulkConfirm?.action === "activate" ? "default" : "destructive"
              }
              onClick={() =>
                bulkConfirm && executeBulkAction(bulkConfirm.action)
              }
            >
              {bulkConfirm?.label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
