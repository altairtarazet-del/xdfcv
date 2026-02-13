import { useEffect, useState } from "react";
import {
  Plus,
  MoreHorizontal,
  Loader2,
  UserCog,
  Trash2,
  ToggleLeft,
  ToggleRight,
  AlertCircle,
} from "lucide-react";
import { api } from "@/api/client";
import type { Admin } from "@/types";
import { ROLE_COLORS } from "@/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";

const ROLES = ["viewer", "operator", "admin", "super_admin"] as const;

export default function TeamManagement() {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("admin");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const [editRoleOpen, setEditRoleOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Admin | null>(null);
  const [editRole, setEditRole] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Admin | null>(null);

  async function loadAdmins() {
    try {
      const data = await api.get<{ admins: Admin[] }>("/api/admin/team");
      setAdmins(data.admins);
    } finally {
      setLoading(false);
    }
  }

  async function createAdmin(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      await api.post("/api/admin/team", {
        username,
        password,
        display_name: displayName || null,
        role,
      });
      setUsername("");
      setPassword("");
      setDisplayName("");
      setRole("admin");
      setCreateOpen(false);
      loadAdmins();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setCreating(false);
    }
  }

  async function updateRole() {
    if (!editTarget) return;
    try {
      await api.patch(`/api/admin/team/${editTarget.id}`, { role: editRole });
      setEditRoleOpen(false);
      setEditTarget(null);
      loadAdmins();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update");
    }
  }

  async function toggleActive(admin: Admin) {
    try {
      await api.patch(`/api/admin/team/${admin.id}`, {
        is_active: !admin.is_active,
      });
      loadAdmins();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await api.delete(`/api/admin/team/${deleteTarget.id}`);
      setDeleteOpen(false);
      setDeleteTarget(null);
      loadAdmins();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  useEffect(() => {
    loadAdmins();
  }, []);

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Team Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage admin users and their roles
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" />
              Add Member
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Team Member</DialogTitle>
              <DialogDescription>
                Create a new admin account with the specified role.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={createAdmin} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name</Label>
                <Input
                  id="displayName"
                  placeholder="Display Name (optional)"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r.replace("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={creating}>
                  {creating && <Loader2 className="animate-spin" />}
                  {creating ? "Creating..." : "Add Member"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Error banner */}
      {error && !createOpen && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Team Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Username</TableHead>
              <TableHead>Display Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Login</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {admins.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">{a.username}</TableCell>
                <TableCell className="text-muted-foreground">
                  {a.display_name || "\u2014"}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    className={`capitalize ${ROLE_COLORS[a.role || "viewer"] || ""}`}
                  >
                    {(a.role || "viewer").replace("_", " ")}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    className={
                      a.is_active
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-red-100 text-red-700"
                    }
                  >
                    {a.is_active ? "Active" : "Disabled"}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {a.last_login_at
                    ? new Date(a.last_login_at).toLocaleString()
                    : "Never"}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          setEditTarget(a);
                          setEditRole(a.role || "viewer");
                          setEditRoleOpen(true);
                        }}
                      >
                        <UserCog className="h-4 w-4" />
                        Change Role
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toggleActive(a)}>
                        {a.is_active ? (
                          <ToggleLeft className="h-4 w-4" />
                        ) : (
                          <ToggleRight className="h-4 w-4" />
                        )}
                        {a.is_active ? "Disable" : "Enable"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => {
                          setDeleteTarget(a);
                          setDeleteOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
            {admins.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-muted-foreground"
                >
                  No team members found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Edit Role Dialog */}
      <Dialog open={editRoleOpen} onOpenChange={setEditRoleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Role</DialogTitle>
            <DialogDescription>
              Update the role for{" "}
              <span className="font-medium text-foreground">
                {editTarget?.username}
              </span>
              .
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>New Role</Label>
            <Select value={editRole} onValueChange={setEditRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r.replace("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRoleOpen(false)}>
              Cancel
            </Button>
            <Button onClick={updateRole}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Admin</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium text-foreground">
                "{deleteTarget?.username}"
              </span>
              ? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
