import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { UserPlus, Trash2, Edit, Shield } from 'lucide-react';
import { CustomRole, UserWithRole } from '@/types/auth';

export default function UsersPage() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserWithRole | null>(null);
  
  // Form state
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formRoleId, setFormRoleId] = useState<string>('');

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
      fetchRoles();
    }
  }, [isAdmin]);

  const fetchUsers = async () => {
    try {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch roles for each user
      const usersWithRoles: UserWithRole[] = await Promise.all(
        (profiles || []).map(async (profile) => {
          const { data: roleData } = await supabase
            .from('user_roles')
            .select('*, custom_roles(*)')
            .eq('user_id', profile.user_id)
            .maybeSingle();

          return {
            ...profile,
            role: roleData?.role,
            custom_role: roleData?.custom_roles,
          };
        })
      );

      setUsers(usersWithRoles);
    } catch (error: any) {
      console.error('Error fetching users:', error);
      toast({
        variant: 'destructive',
        title: 'Hata',
        description: 'Kullanıcılar yüklenirken bir hata oluştu',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRoles = async () => {
    const { data, error } = await supabase
      .from('custom_roles')
      .select('*')
      .order('name');

    if (!error && data) {
      setRoles(data);
    }
  };

  const handleCreateUser = async () => {
    if (!formEmail || !formPassword) {
      toast({
        variant: 'destructive',
        title: 'Hata',
        description: 'E-posta ve şifre zorunludur',
      });
      return;
    }

    try {
      // Call edge function to create user
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          email: formEmail,
          password: formPassword,
          displayName: formDisplayName,
          customRoleId: formRoleId || null,
        },
      });

      if (error) throw error;

      toast({
        title: 'Başarılı',
        description: 'Kullanıcı oluşturuldu',
      });

      setIsDialogOpen(false);
      resetForm();
      fetchUsers();
    } catch (error: any) {
      console.error('Error creating user:', error);
      toast({
        variant: 'destructive',
        title: 'Hata',
        description: error.message || 'Kullanıcı oluşturulurken bir hata oluştu',
      });
    }
  };

  const handleUpdateUserRole = async (userId: string, customRoleId: string | null) => {
    try {
      // First delete existing custom role assignment
      await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .not('role', 'eq', 'admin');

      if (customRoleId) {
        // Insert new role assignment
        const { error } = await supabase
          .from('user_roles')
          .insert({
            user_id: userId,
            role: 'user',
            custom_role_id: customRoleId,
          });

        if (error) throw error;
      }

      toast({
        title: 'Başarılı',
        description: 'Kullanıcı rolü güncellendi',
      });

      fetchUsers();
    } catch (error: any) {
      console.error('Error updating role:', error);
      toast({
        variant: 'destructive',
        title: 'Hata',
        description: 'Rol güncellenirken bir hata oluştu',
      });
    }
  };

  const resetForm = () => {
    setFormEmail('');
    setFormPassword('');
    setFormDisplayName('');
    setFormRoleId('');
    setEditingUser(null);
  };

  if (!isAdmin) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <Shield size={48} className="mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold text-foreground">Erişim Engellendi</h2>
            <p className="text-muted-foreground text-sm">
              Bu sayfayı görüntülemek için admin yetkisi gerekiyor
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Kullanıcı Yönetimi
            </h1>
            <p className="text-muted-foreground text-sm">
              Sistem kullanıcılarını yönetin ve rol atayın
            </p>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus size={18} className="mr-2" />
                Yeni Kullanıcı
              </Button>
            </DialogTrigger>
            <DialogContent className="cyber-card border-primary/30">
              <DialogHeader>
                <DialogTitle className="text-foreground">
                  Yeni Kullanıcı Oluştur
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs">E-POSTA</Label>
                  <Input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="cyber-input font-mono"
                    placeholder="user@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs">ŞİFRE</Label>
                  <Input
                    type="password"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    className="cyber-input"
                    placeholder="••••••••"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs">GÖRÜNEN AD</Label>
                  <Input
                    type="text"
                    value={formDisplayName}
                    onChange={(e) => setFormDisplayName(e.target.value)}
                    className="cyber-input"
                    placeholder="John Doe"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs">ROL</Label>
                  <Select value={formRoleId} onValueChange={setFormRoleId}>
                    <SelectTrigger className="cyber-input">
                      <SelectValue placeholder="Rol seçin..." />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleCreateUser} className="w-full">
                  Kullanıcı Oluştur
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Users Table */}
        <div className="cyber-card rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border/50">
                <TableHead className="text-muted-foreground">E-POSTA</TableHead>
                <TableHead className="text-muted-foreground">İSİM</TableHead>
                <TableHead className="text-muted-foreground">ROL</TableHead>
                <TableHead className="text-muted-foreground">KAYIT TARİHİ</TableHead>
                <TableHead className="text-muted-foreground">İŞLEMLER</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    <span className="text-muted-foreground animate-pulse">
                      Yükleniyor...
                    </span>
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    <span className="text-muted-foreground">
                      Henüz kullanıcı yok
                    </span>
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.id} className="border-b border-border/30">
                    <TableCell className="font-mono text-sm">{user.email}</TableCell>
                    <TableCell className="text-sm">
                      {user.display_name || '-'}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={user.custom_role?.id || ''}
                        onValueChange={(value) => handleUpdateUserRole(user.user_id, value || null)}
                        disabled={user.role === 'admin'}
                      >
                        <SelectTrigger className="w-40 cyber-input text-xs">
                          <SelectValue placeholder={user.role === 'admin' ? 'Admin' : 'Rol seç...'} />
                        </SelectTrigger>
                        <SelectContent>
                          {roles.map((role) => (
                            <SelectItem key={role.id} value={role.id} className="text-xs">
                              {role.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {new Date(user.created_at).toLocaleDateString('tr-TR')}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="hover:bg-primary/10 hover:text-primary"
                        >
                          <Edit size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="hover:bg-destructive/10 hover:text-destructive"
                          disabled={user.role === 'admin'}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </DashboardLayout>
  );
}
