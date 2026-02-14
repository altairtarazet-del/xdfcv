import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  MoreHorizontal,
  Search,
  UserPlus,
  Users,
  KeyRound,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Mail,
  Copy,
  Check,
  Eye,
  EyeOff,
  Loader2,
  ScanText,
} from "lucide-react";
import { api } from "@/api/client";
import type { PortalUser, ExtractNamesResult, ProvisionResult } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// --- ProvisionCredentials sub-component ---

function ProvisionCredentials({
  credentials,
  onDone,
}: {
  credentials: { email: string; portal_password: string };
  onDone: () => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expired, setExpired] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(30);

  useEffect(() => {
    const expireTimer = setTimeout(() => {
      setShowPassword(false);
      setExpired(true);
    }, 30000);

    const countdownInterval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(countdownInterval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearTimeout(expireTimer);
      clearInterval(countdownInterval);
    };
  }, []);

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(credentials.portal_password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const el = document.createElement("textarea");
      el.value = credentials.portal_password;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const maskedPassword = credentials.portal_password.replace(/./g, "\u2022");

  return (
    <Card className="border-green-200 bg-green-50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-green-800">
          Customer Created Successfully
        </CardTitle>
        {!expired && (
          <CardDescription className="text-green-700">
            Copy credentials now -- password hidden in {secondsLeft}s
          </CardDescription>
        )}
        {expired && (
          <CardDescription className="text-muted-foreground">
            Password display has expired. If you didn't copy it, reset the
            password.
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-green-200 bg-white p-4 font-mono text-sm space-y-2">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Email:</span>
            <span className="font-medium">{credentials.email}</span>
          </div>
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Password:</span>
            <span
              className={`font-bold cursor-pointer select-all ${expired ? "text-muted-foreground" : "text-green-800"}`}
              onClick={() => !expired && setShowPassword((v) => !v)}
              title={
                expired
                  ? "Expired -- copy was available for 30s"
                  : "Click to reveal"
              }
            >
              {showPassword && !expired
                ? credentials.portal_password
                : maskedPassword}
            </span>
            {!expired && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1"
                onClick={copyToClipboard}
              >
                {copied ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                {copied ? "Copied" : "Copy"}
              </Button>
            )}
            {!expired && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
              </Button>
            )}
            {expired && (
              <Badge variant="secondary" className="text-xs">
                expired
              </Badge>
            )}
          </div>
        </div>
        <Button onClick={onDone}>Done</Button>
      </CardContent>
    </Card>
  );
}

// --- Table skeleton ---

function UsersTableSkeleton() {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Display Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Login</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Skeleton className="h-4 w-48" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-32" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-28" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-24" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-8 w-8 rounded-md" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// --- Main page ---

export default function PortalUsersPage() {
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const adminRole = localStorage.getItem("admin_role") || "admin";
  const canManage = adminRole === "admin" || adminRole === "super_admin";

  // Provision wizard state
  const [showProvision, setShowProvision] = useState(false);
  const [provFirstName, setProvFirstName] = useState("");
  const [provMiddleName, setProvMiddleName] = useState("");
  const [provLastName, setProvLastName] = useState("");
  const [provDobMonth, setProvDobMonth] = useState("");
  const [provDobDay, setProvDobDay] = useState("");
  const [provDobYear, setProvDobYear] = useState("");
  const [provisioning, setProvisioning] = useState(false);
  const [provResult, setProvResult] = useState<ProvisionResult | null>(null);

  // Extract names state
  const [extracting, setExtracting] = useState(false);

  // Manual create dialog state
  const [showManual, setShowManual] = useState(false);
  const [manualEmail, setManualEmail] = useState("");
  const [manualPassword, setManualPassword] = useState("");
  const [manualName, setManualName] = useState("");
  const [creating, setCreating] = useState(false);

  // Reset password dialog state
  const [resetResult, setResetResult] = useState<{ email: string; password: string } | null>(null);

  // Delete confirmation dialog
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Auto-generated email preview
  const generatedEmail =
    provFirstName && provLastName
      ? `${provFirstName.toLowerCase().replace(/[^a-z]/g, "")}${provLastName.toLowerCase().replace(/[^a-z]/g, "")}@dasherhelp.com`
      : "";

  const loadUsers = useCallback(async () => {
    try {
      const params = search ? `?search=${encodeURIComponent(search)}` : "";
      const data = await api.get<{ users: PortalUser[] }>(
        `/api/portal-users${params}`
      );
      setUsers(data.users);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [search]);

  async function provisionCustomer(e: React.FormEvent) {
    e.preventDefault();
    setProvisioning(true);
    try {
      let dob: string | null = null;
      if (provDobYear && provDobMonth && provDobDay) {
        const m = parseInt(provDobMonth, 10);
        const d = parseInt(provDobDay, 10);
        const y = parseInt(provDobYear, 10);
        if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) {
          toast.error(
            "Invalid date of birth. Month: 1-12, Day: 1-31, Year: 1900-2100"
          );
          setProvisioning(false);
          return;
        }
        dob = `${provDobYear}-${provDobMonth.padStart(2, "0")}-${provDobDay.padStart(2, "0")}`;
      }
      const result = await api.post<ProvisionResult>("/api/provision", {
        first_name: provFirstName,
        middle_name: provMiddleName || null,
        last_name: provLastName,
        date_of_birth: dob,
      });
      setProvResult(result);
      loadUsers();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Provisioning failed");
    } finally {
      setProvisioning(false);
    }
  }

  function resetProvisionForm() {
    setShowProvision(false);
    setProvResult(null);
    setProvFirstName("");
    setProvMiddleName("");
    setProvLastName("");
    setProvDobMonth("");
    setProvDobDay("");
    setProvDobYear("");
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await api.post("/api/portal-users", {
        email: manualEmail,
        password: manualPassword,
        display_name: manualName || null,
      });
      setManualEmail("");
      setManualPassword("");
      setManualName("");
      setShowManual(false);
      toast.success("Portal user created");
      loadUsers();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(user: PortalUser) {
    try {
      await api.patch(`/api/portal-users/${encodeURIComponent(user.email)}`, {
        is_active: !user.is_active,
      });
      toast.success(
        `${user.email} ${user.is_active ? "disabled" : "enabled"}`
      );
      loadUsers();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    }
  }

  async function resetPassword(email: string) {
    try {
      const newPassword = Math.random().toString(36).slice(-10);
      await api.patch(`/api/portal-users/${encodeURIComponent(email)}`, {
        password: newPassword,
      });
      setResetResult({ email, password: newPassword });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to reset password");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(
        `/api/portal-users/${encodeURIComponent(deleteTarget)}`
      );
      toast.success(`Deleted ${deleteTarget}`);
      setDeleteTarget(null);
      loadUsers();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  }

  async function extractNames() {
    setExtracting(true);
    try {
      const result = await api.post<ExtractNamesResult>(
        "/api/dashboard/accounts/extract-names",
        {}
      );
      toast.success(
        `Name extraction complete: ${result.updated} updated out of ${result.processed} processed${result.failed > 0 ? `, ${result.failed} failed` : ""}`
      );
      loadUsers();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Name extraction failed"
      );
    } finally {
      setExtracting(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "--";
    try {
      return new Date(dateStr).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Customer Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage portal users and customer accounts
          </p>
        </div>
        <div className="flex gap-2">
          {canManage && (
            <Button
              variant="outline"
              onClick={extractNames}
              disabled={extracting}
            >
              {extracting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ScanText className="h-4 w-4" />
              )}
              Extract Names
            </Button>
          )}
          <Button
            onClick={() => {
              setShowProvision(true);
              setShowManual(false);
              setProvResult(null);
            }}
          >
            <UserPlus className="h-4 w-4" />
            New Customer
          </Button>
          {canManage && (
            <Button variant="outline" onClick={() => setShowManual(true)}>
              <Users className="h-4 w-4" />
              Manual Create
            </Button>
          )}
        </div>
      </div>

      {/* Provision Wizard */}
      {showProvision && !provResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              New Customer -- Auto Provision
            </CardTitle>
            <CardDescription>
              Creates SMTP.dev email account, DB record, and portal login in one
              step.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={provisionCustomer} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="prov-first">First Name *</Label>
                  <Input
                    id="prov-first"
                    placeholder="Muhammet"
                    value={provFirstName}
                    onChange={(e) => setProvFirstName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="prov-middle">Middle Name</Label>
                  <Input
                    id="prov-middle"
                    placeholder="Oguz"
                    value={provMiddleName}
                    onChange={(e) => setProvMiddleName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="prov-last">Last Name *</Label>
                  <Input
                    id="prov-last"
                    placeholder="Bayram"
                    value={provLastName}
                    onChange={(e) => setProvLastName(e.target.value)}
                    required
                  />
                </div>
              </div>

              {generatedEmail && (
                <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-4 py-3 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Email:</span>
                  <span className="font-semibold">{generatedEmail}</span>
                </div>
              )}

              <div className="space-y-2">
                <Label>Date of Birth</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="MM"
                    value={provDobMonth}
                    onChange={(e) =>
                      setProvDobMonth(
                        e.target.value.replace(/\D/g, "").slice(0, 2)
                      )
                    }
                    maxLength={2}
                    className="w-16 text-center"
                  />
                  <Input
                    placeholder="DD"
                    value={provDobDay}
                    onChange={(e) =>
                      setProvDobDay(
                        e.target.value.replace(/\D/g, "").slice(0, 2)
                      )
                    }
                    maxLength={2}
                    className="w-16 text-center"
                  />
                  <Input
                    placeholder="YYYY"
                    value={provDobYear}
                    onChange={(e) =>
                      setProvDobYear(
                        e.target.value.replace(/\D/g, "").slice(0, 4)
                      )
                    }
                    maxLength={4}
                    className="w-20 text-center"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={provisioning}>
                  {provisioning && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {provisioning ? "Provisioning..." : "Create Customer"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetProvisionForm}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Provision Result */}
      {provResult && (
        <ProvisionCredentials
          credentials={provResult.credentials}
          onDone={resetProvisionForm}
        />
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search customers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Users Table */}
      {loading ? (
        <UsersTableSkeleton />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Display Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      <Link
                        to={`/emails/${encodeURIComponent(u.email)}`}
                        className="hover:underline"
                      >
                        {u.email}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {u.display_name ||
                        [u.first_name, u.middle_name, u.last_name]
                          .filter(Boolean)
                          .join(" ") ||
                        "--"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={u.is_active ? "default" : "destructive"}
                        className={
                          u.is_active
                            ? "bg-green-100 text-green-800 hover:bg-green-100 border-transparent"
                            : ""
                        }
                      >
                        {u.is_active ? "Active" : "Disabled"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(u.last_login_at)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(u.created_at)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Open menu</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link to={`/emails/${encodeURIComponent(u.email)}`}>
                              <Mail className="h-4 w-4" />
                              View Emails
                            </Link>
                          </DropdownMenuItem>
                          {canManage && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => resetPassword(u.email)}
                              >
                                <KeyRound className="h-4 w-4" />
                                Reset Password
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => toggleActive(u)}
                              >
                                {u.is_active ? (
                                  <ToggleLeft className="h-4 w-4" />
                                ) : (
                                  <ToggleRight className="h-4 w-4" />
                                )}
                                {u.is_active ? "Disable" : "Enable"}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeleteTarget(u.email)}
                              >
                                <Trash2 className="h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {users.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-32 text-center text-muted-foreground"
                    >
                      No customers found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Manual Create Dialog */}
      <Dialog open={showManual} onOpenChange={setShowManual}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manual Portal User Create</DialogTitle>
            <DialogDescription>
              Create a portal user with custom email and password.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={createUser} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="manual-email">Email *</Label>
              <Input
                id="manual-email"
                type="email"
                placeholder="user@example.com"
                value={manualEmail}
                onChange={(e) => setManualEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="manual-password">Password *</Label>
              <Input
                id="manual-password"
                type="password"
                placeholder="Password"
                value={manualPassword}
                onChange={(e) => setManualPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="manual-name">Display Name</Label>
              <Input
                id="manual-name"
                type="text"
                placeholder="John Doe"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowManual(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                {creating ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Portal User</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-semibold">{deleteTarget}</span>? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Result Dialog */}
      <Dialog
        open={resetResult !== null}
        onOpenChange={(open) => !open && setResetResult(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Password Reset Successful</DialogTitle>
            <DialogDescription>
              New credentials for <span className="font-semibold">{resetResult?.email}</span>
            </DialogDescription>
          </DialogHeader>
          {resetResult && (
            <ProvisionCredentials
              credentials={{ email: resetResult.email, portal_password: resetResult.password }}
              onDone={() => setResetResult(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
