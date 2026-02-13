import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "@/api/client";
import {
  ArrowLeft,
  User,
  Clock,
  BarChart3,
  AlertTriangle,
  ArrowRight,
  Search,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import type { Account, HistoryEntry, Admin, Analysis } from "@/types";
import { STAGE_COLORS, STAGE_BADGE, STATUS_BADGE } from "@/types";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const STAGES = [
  "REGISTERED",
  "IDENTITY_VERIFIED",
  "BGC_PENDING",
  "BGC_CLEAR",
  "BGC_CONSIDER",
  "ACTIVE",
  "DEACTIVATED",
];

const CATEGORY_COLORS: Record<string, string> = {
  bgc: "bg-purple-100 text-purple-700",
  account: "bg-blue-100 text-blue-700",
  earnings: "bg-emerald-100 text-emerald-700",
  operational: "bg-dd-200 text-dd-700",
  warning: "bg-dd-red-light text-dd-red",
  unknown: "bg-yellow-100 text-yellow-700",
};

const URGENCY_COLORS: Record<string, string> = {
  critical: "text-red-600 font-bold",
  high: "text-orange-600 font-semibold",
  medium: "text-yellow-600 font-medium",
  low: "text-dd-600",
  info: "text-blue-500",
};

// --- Loading Skeleton ---

function AccountDetailSkeleton() {
  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <Skeleton className="h-4 w-36" />
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-6 w-28 rounded-full" />
      </div>
      <Card>
        <CardContent className="p-6">
          <Skeleton className="h-3 w-32 mb-4" />
          <div className="flex gap-1.5">
            {STAGES.map((s) => (
              <Skeleton key={s} className="h-2 flex-1 rounded-full" />
            ))}
          </div>
        </CardContent>
      </Card>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-4 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Skeleton className="h-10 w-72" />
      <Card>
        <CardContent className="p-6 space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// --- History Timeline Entry ---

function HistoryTimelineEntry({ entry }: { entry: HistoryEntry }) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="w-3 h-3 rounded-full bg-primary border-2 border-background shadow" />
        <Separator orientation="vertical" className="flex-1 my-1" />
      </div>
      <Card className="flex-1 mb-4">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 flex-wrap">
            {entry.old_stage ? (
              <Badge className={STAGE_BADGE[entry.old_stage] || "bg-dd-200 text-dd-800"}>
                {entry.old_stage.replace(/_/g, " ")}
              </Badge>
            ) : (
              <span className="text-xs text-muted-foreground">--</span>
            )}
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            <Badge className={STAGE_BADGE[entry.new_stage] || "bg-dd-200 text-dd-800"}>
              {entry.new_stage.replace(/_/g, " ")}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {new Date(entry.changed_at).toLocaleString()}
          </p>
          {entry.trigger_email_subject && (
            <p className="text-xs text-muted-foreground mt-1 truncate">
              Trigger: {entry.trigger_email_subject}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// --- Analysis Tab ---

function AnalysisTab({ accountId, email }: { accountId: string; email: string }) {
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [urgency, setUrgency] = useState("");
  const [source, setSource] = useState("");
  const [actionRequired, setActionRequired] = useState<boolean | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const perPage = 50;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [filter, urgency, source, actionRequired, debouncedSearch]);

  async function loadAnalyses() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter) params.set("category", filter);
      if (urgency) params.set("urgency", urgency);
      if (source) params.set("source", source);
      if (actionRequired !== null) params.set("action_required", String(actionRequired));
      if (debouncedSearch) params.set("search", debouncedSearch);
      params.set("page", String(page));
      params.set("per_page", String(perPage));

      const qs = params.toString();
      const data = await api.get<{ analyses: Analysis[]; total: number; page: number; per_page: number }>(
        `/api/analysis/account/${accountId}?${qs}`
      );
      setAnalyses(data.analyses);
      setTotal(data.total);
    } catch {
      setAnalyses([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAnalyses();
  }, [accountId, filter, urgency, source, actionRequired, debouncedSearch, page]);

  const hasFilters = !!(urgency || source || actionRequired !== null || debouncedSearch);
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const categoryCounts: Record<string, number> = {};
  for (const a of analyses) {
    categoryCounts[a.category] = (categoryCounts[a.category] || 0) + 1;
  }

  return (
    <div className="space-y-4">
      {/* Category filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant={!filter ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("")}
        >
          All {!hasFilters ? `(${total})` : ""}
        </Button>
        {Object.entries(categoryCounts).map(([cat, count]) => (
          <Badge
            key={cat}
            className={`cursor-pointer ${CATEGORY_COLORS[cat] || "bg-dd-200 text-dd-700"} ${
              filter === cat ? "ring-2 ring-primary ring-offset-1" : ""
            }`}
            onClick={() => setFilter(cat === filter ? "" : cat)}
          >
            {cat} ({count})
          </Badge>
        ))}
      </div>

      {/* Advanced filters */}
      <Card>
        <CardContent className="p-3 flex items-center gap-3 flex-wrap">
          <Select value={urgency} onValueChange={setUrgency}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue placeholder="All Urgency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Urgency</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="info">Info</SelectItem>
            </SelectContent>
          </Select>

          <Select value={source} onValueChange={setSource}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue placeholder="All Sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="rules">Rules</SelectItem>
              <SelectItem value="rules_dedup">Rules (Dedup)</SelectItem>
              <SelectItem value="ai">AI</SelectItem>
              <SelectItem value="ai_dedup">AI (Dedup)</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
            </SelectContent>
          </Select>

          <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={actionRequired === true}
              onChange={(e) => setActionRequired(e.target.checked ? true : null)}
              className="rounded border-input text-primary focus:ring-primary"
            />
            Action Required
          </label>

          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search summary..."
              className="pl-8 h-8 text-xs"
            />
          </div>

          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setUrgency(""); setSource(""); setActionRequired(null); setSearch(""); }}
            >
              Clear filters
            </Button>
          )}
        </CardContent>
      </Card>

      {/* View emails link */}
      <div className="text-right">
        <Button variant="link" asChild className="text-primary">
          <Link to={`/emails/${encodeURIComponent(email)}`}>
            View All Emails
            <ExternalLink className="h-3.5 w-3.5 ml-1" />
          </Link>
        </Button>
      </div>

      {/* Analysis table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Loading analyses...</span>
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Summary</TableHead>
                <TableHead>Urgency</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {analyses.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <Badge className={CATEGORY_COLORS[a.category] || "bg-dd-200 text-dd-700"}>
                      {a.category}/{a.sub_category}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">
                    {a.summary}
                  </TableCell>
                  <TableCell>
                    <span className={`text-xs ${URGENCY_COLORS[a.urgency] || "text-muted-foreground"}`}>
                      {a.urgency.toUpperCase()}
                      {a.action_required && (
                        <Badge variant="destructive" className="ml-1.5 text-[10px] px-1.5 py-0">
                          ACTION
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {a.analysis_source}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${Math.round(a.confidence * 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {Math.round(a.confidence * 100)}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(a.created_at).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
              {analyses.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12">
                    <p className="text-sm text-muted-foreground">
                      {hasFilters ? "No analyses match your filters" : "No email analyses yet"}
                    </p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      {hasFilters ? "Try adjusting your filter criteria" : "Run a scan to analyze emails for this account"}
                    </p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {total > perPage && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <span className="text-xs text-muted-foreground">
                Showing {(page - 1) * perPage + 1}-{Math.min(page * perPage, total)} of {total}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Prev
                </Button>
                <span className="text-xs text-muted-foreground">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// --- Main Component ---

export default function AccountDetail() {
  const { email } = useParams<{ email: string }>();
  const [account, setAccount] = useState<Account | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [error, setError] = useState("");

  // Edit form state
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("active");
  const [assignedAdmin, setAssignedAdmin] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const data = await api.get<{ account: Account; history: HistoryEntry[] }>(
        `/api/dashboard/accounts/${encodeURIComponent(email!)}`
      );
      setAccount(data.account);
      setHistory(data.history);
      setCustomerName(data.account.customer_name || "");
      setPhone(data.account.phone || "");
      setNotes(data.account.notes || "");
      setStatus(data.account.status || "active");
      setAssignedAdmin(data.account.assigned_admin_id || "");
      setTags(data.account.tags || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }

  async function loadAdmins() {
    try {
      const data = await api.get<{ admins: Admin[] }>("/api/admin/team");
      setAdmins(data.admins);
    } catch {
      // non-critical
    }
  }

  async function saveAccount() {
    setSaving(true);
    try {
      await api.patch(`/api/dashboard/accounts/${encodeURIComponent(email!)}`, {
        customer_name: customerName || null,
        phone: phone || null,
        notes: notes || null,
        status,
        assigned_admin_id: assignedAdmin || null,
        tags,
      });
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function addTag() {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
    }
    setTagInput("");
  }

  function removeTag(tag: string) {
    setTags(tags.filter((tg) => tg !== tag));
  }

  useEffect(() => {
    load();
    loadAdmins();
  }, [email]);

  if (error) {
    return (
      <div className="p-8">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!account) {
    return <AccountDetailSkeleton />;
  }

  const currentIndex = STAGES.indexOf(account.stage);

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      {/* Back link */}
      <Button variant="link" asChild className="p-0 h-auto text-primary">
        <Link to="/">
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>
      </Button>

      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{account.email}</h1>
          {account.customer_name && (
            <p className="text-sm text-muted-foreground mt-1">{account.customer_name}</p>
          )}
        </div>
        <Badge className={STAGE_BADGE[account.stage] || "bg-dd-200 text-dd-800"}>
          {account.stage.replace(/_/g, " ")}
        </Badge>
      </div>

      {/* Stage Progression Bar */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="uppercase text-[12px] font-semibold text-muted-foreground tracking-wider">
            Stage Progression
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-1.5">
            {STAGES.map((s, i) => {
              const isCurrent = s === account.stage;
              const isPast = i <= currentIndex;
              const colors = STAGE_COLORS[s] || { active: "bg-dd-300", bar: "bg-dd-200" };
              return (
                <div key={s} className="flex-1">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      isPast ? colors.bar : "bg-muted"
                    } ${isCurrent ? `${colors.active} ring-2 ring-offset-1 ring-primary` : ""}`}
                  />
                  <div
                    className={`text-[10px] mt-1.5 text-center leading-tight ${
                      isCurrent
                        ? "font-bold text-foreground"
                        : isPast
                        ? "font-medium text-muted-foreground"
                        : "text-muted-foreground/50"
                    }`}
                  >
                    {s.replace(/_/g, " ")}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Info Grid Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: "Current Stage",
            value: account.stage.replace(/_/g, " "),
            badge: STAGE_BADGE[account.stage],
          },
          {
            label: "Status",
            value: account.status.charAt(0).toUpperCase() + account.status.slice(1),
            badge: STATUS_BADGE[account.status],
          },
          {
            label: "Last Scanned",
            value: account.last_scanned_at
              ? new Date(account.last_scanned_at).toLocaleString()
              : "Never",
          },
          {
            label: "Created",
            value: account.created_at
              ? new Date(account.created_at).toLocaleString()
              : "--",
          },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="p-4">
              <p className="uppercase text-[11px] font-semibold text-muted-foreground tracking-wider">
                {item.label}
              </p>
              {item.badge ? (
                <Badge className={`mt-2 ${item.badge}`}>{item.value}</Badge>
              ) : (
                <p className="text-sm font-medium mt-2">{item.value}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Scan Error Alert */}
      {account.scan_error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Last Scan Error</AlertTitle>
          <AlertDescription>{account.scan_error}</AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info" className="gap-2">
            <User className="h-4 w-4" />
            Account Info
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <Clock className="h-4 w-4" />
            Stage History
          </TabsTrigger>
          <TabsTrigger value="analysis" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Email Analysis
          </TabsTrigger>
        </TabsList>

        {/* Info Tab */}
        <TabsContent value="info">
          <Card>
            <CardHeader>
              <CardTitle className="uppercase text-[12px] font-semibold text-muted-foreground tracking-wider">
                Account Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label>Customer Name</Label>
                  <Input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Enter customer name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Enter phone number"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Assigned Admin</Label>
                  <Select value={assignedAdmin || "unassigned"} onValueChange={(v) => setAssignedAdmin(v === "unassigned" ? "" : v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {admins.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.display_name || a.username}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Tags */}
              <div className="space-y-2">
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-2 mb-1">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1.5">
                      {tag}
                      <button onClick={() => removeTag(tag)}>
                        <X className="h-3 w-3 hover:text-destructive transition-colors" />
                      </button>
                    </Badge>
                  ))}
                  {tags.length === 0 && (
                    <span className="text-xs text-muted-foreground">No tags added</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                    placeholder="Add a tag..."
                    className="w-auto"
                  />
                  <Button variant="outline" onClick={addTag}>
                    Add
                  </Button>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Add notes about this account..."
                />
              </div>

              {/* Save Button */}
              <div className="flex items-center gap-3 pt-2">
                <Button onClick={saveAccount} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          {history.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-sm text-muted-foreground">No stage changes recorded</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Changes will appear here as the account progresses
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="pl-2 pt-2">
              {history.map((h) => (
                <HistoryTimelineEntry key={h.id} entry={h} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Analysis Tab */}
        <TabsContent value="analysis">
          <AnalysisTab accountId={account.id} email={account.email} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
