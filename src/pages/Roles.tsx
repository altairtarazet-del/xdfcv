import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Edit, Shield, Clock, Mail, Users } from 'lucide-react';
import { CustomRole, RolePermission } from '@/types/auth';

interface RoleWithPermissions extends CustomRole {
  permissions?: RolePermission | null;
}

export default function RolesPage() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [roles, setRoles] = useState<RoleWithPermissions[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleWithPermissions | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formTimeFilter, setFormTimeFilter] = useState<string>('');
  const [formMailboxes, setFormMailboxes] = useState('');
  const [formSenders, setFormSenders] = useState('');
  const [formReceivers, setFormReceivers] = useState('');
  const [formRealtime, setFormRealtime] = useState(true);

  useEffect(() => {
    if (isAdmin) {
      fetchRoles();
    }
  }, [isAdmin]);

  const fetchRoles = async () => {
    try {
      const { data: rolesData, error } = await supabase
        .from('custom_roles')
        .select('*')
        .order('name');

      if (error) throw error;

      // Fetch permissions for each role
      const rolesWithPermissions: RoleWithPermissions[] = await Promise.all(
        (rolesData || []).map(async (role) => {
          const { data: permData } = await supabase
            .from('role_permissions')
            .select('*')
            .eq('custom_role_id', role.id)
            .maybeSingle();

          return {
            ...role,
            permissions: permData,
          };
        })
      );

      setRoles(rolesWithPermissions);
    } catch (error: any) {
      console.error('Error fetching roles:', error);
      toast({
        variant: 'destructive',
        title: 'Hata',
        description: 'Roller yüklenirken bir hata oluştu',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveRole = async () => {
    if (!formName) {
      toast({
        variant: 'destructive',
        title: 'Hata',
        description: 'Rol adı zorunludur',
      });
      return;
    }

    try {
      let roleId = editingRole?.id;

      if (editingRole) {
        // Update existing role
        const { error } = await supabase
          .from('custom_roles')
          .update({
            name: formName,
            description: formDescription || null,
          })
          .eq('id', editingRole.id);

        if (error) throw error;
      } else {
        // Create new role
        const { data, error } = await supabase
          .from('custom_roles')
          .insert({
            name: formName,
            description: formDescription || null,
          })
          .select()
          .single();

        if (error) throw error;
        roleId = data.id;
      }

      // Save permissions
      if (roleId) {
        const permissions = {
          custom_role_id: roleId,
          time_filter_minutes: formTimeFilter ? parseInt(formTimeFilter) : null,
          allowed_mailboxes: formMailboxes ? formMailboxes.split(',').map(s => s.trim()) : null,
          allowed_senders: formSenders ? formSenders.split(',').map(s => s.trim()) : null,
          allowed_receivers: formReceivers ? formReceivers.split(',').map(s => s.trim()) : null,
          realtime_enabled: formRealtime,
        };

        // Upsert permissions
        const { error: permError } = await supabase
          .from('role_permissions')
          .upsert(permissions, {
            onConflict: 'custom_role_id',
          });

        if (permError) throw permError;
      }

      toast({
        title: 'Başarılı',
        description: editingRole ? 'Rol güncellendi' : 'Rol oluşturuldu',
      });

      setIsDialogOpen(false);
      resetForm();
      fetchRoles();
    } catch (error: any) {
      console.error('Error saving role:', error);
      toast({
        variant: 'destructive',
        title: 'Hata',
        description: error.message || 'Rol kaydedilirken bir hata oluştu',
      });
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    if (!confirm('Bu rolü silmek istediğinize emin misiniz?')) return;

    try {
      const { error } = await supabase
        .from('custom_roles')
        .delete()
        .eq('id', roleId);

      if (error) throw error;

      toast({
        title: 'Başarılı',
        description: 'Rol silindi',
      });

      fetchRoles();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Hata',
        description: 'Rol silinirken bir hata oluştu',
      });
    }
  };

  const openEditDialog = (role: RoleWithPermissions) => {
    setEditingRole(role);
    setFormName(role.name);
    setFormDescription(role.description || '');
    setFormTimeFilter(role.permissions?.time_filter_minutes?.toString() || '');
    setFormMailboxes(role.permissions?.allowed_mailboxes?.join(', ') || '');
    setFormSenders(role.permissions?.allowed_senders?.join(', ') || '');
    setFormReceivers(role.permissions?.allowed_receivers?.join(', ') || '');
    setFormRealtime(role.permissions?.realtime_enabled ?? true);
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setFormName('');
    setFormDescription('');
    setFormTimeFilter('');
    setFormMailboxes('');
    setFormSenders('');
    setFormReceivers('');
    setFormRealtime(true);
    setEditingRole(null);
  };

  if (!isAdmin) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <Shield size={48} className="mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-mono text-foreground">Erişim Engellendi</h2>
            <p className="text-muted-foreground font-mono text-sm">
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
            <h1 className="text-2xl font-mono font-bold text-foreground cyber-glow-text">
              Rol Yönetimi
            </h1>
            <p className="text-muted-foreground font-mono text-sm">
              Özel roller ve izinleri yönetin
            </p>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button className="cyber-glow font-mono">
                <Plus size={18} className="mr-2" />
                Yeni Rol
              </Button>
            </DialogTrigger>
            <DialogContent className="cyber-card border-primary/30 max-w-lg">
              <DialogHeader>
                <DialogTitle className="font-mono text-foreground">
                  {editingRole ? 'Rol Düzenle' : 'Yeni Rol Oluştur'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4 max-h-[60vh] overflow-y-auto pr-2">
                <div className="space-y-2">
                  <Label className="text-muted-foreground font-mono text-xs">ROL ADI</Label>
                  <Input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="cyber-input font-mono"
                    placeholder="Developer, QA Tester, Viewer..."
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground font-mono text-xs">AÇIKLAMA</Label>
                  <Textarea
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="cyber-input font-mono resize-none"
                    placeholder="Bu rol için açıklama..."
                    rows={2}
                  />
                </div>

                <div className="border-t border-border/30 pt-4">
                  <h3 className="text-sm font-mono text-foreground mb-3 flex items-center gap-2">
                    <Shield size={16} className="text-primary" />
                    İzin Filtreleri
                  </h3>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-muted-foreground font-mono text-xs flex items-center gap-2">
                        <Clock size={14} />
                        ZAMAN FİLTRESİ (dakika)
                      </Label>
                      <Input
                        type="number"
                        value={formTimeFilter}
                        onChange={(e) => setFormTimeFilter(e.target.value)}
                        className="cyber-input font-mono"
                        placeholder="Örn: 20 (son 20 dakika)"
                      />
                      <p className="text-xs text-muted-foreground font-mono">
                        Boş bırakılırsa tüm mailleri görebilir
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-muted-foreground font-mono text-xs flex items-center gap-2">
                        <Mail size={14} />
                        İZİN VERİLEN POSTA KUTULARI
                      </Label>
                      <Input
                        value={formMailboxes}
                        onChange={(e) => setFormMailboxes(e.target.value)}
                        className="cyber-input font-mono"
                        placeholder="mailbox-id-1, mailbox-id-2"
                      />
                      <p className="text-xs text-muted-foreground font-mono">
                        Virgülle ayırarak birden fazla ekleyebilirsiniz
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-muted-foreground font-mono text-xs flex items-center gap-2">
                        <Users size={14} />
                        İZİN VERİLEN GÖNDERİCİLER
                      </Label>
                      <Input
                        value={formSenders}
                        onChange={(e) => setFormSenders(e.target.value)}
                        className="cyber-input font-mono"
                        placeholder="sender@example.com, *@domain.com"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-muted-foreground font-mono text-xs flex items-center gap-2">
                        <Users size={14} />
                        İZİN VERİLEN ALICILAR
                      </Label>
                      <Input
                        value={formReceivers}
                        onChange={(e) => setFormReceivers(e.target.value)}
                        className="cyber-input font-mono"
                        placeholder="receiver@example.com"
                      />
                    </div>

                    <div className="flex items-center justify-between py-2">
                      <div>
                        <Label className="text-muted-foreground font-mono text-xs">
                          GERÇEK ZAMANLI GÜNCELLEME
                        </Label>
                        <p className="text-xs text-muted-foreground font-mono">
                          Yeni mail geldiğinde otomatik güncelle
                        </p>
                      </div>
                      <Switch
                        checked={formRealtime}
                        onCheckedChange={setFormRealtime}
                      />
                    </div>
                  </div>
                </div>

                <Button onClick={handleSaveRole} className="w-full cyber-glow font-mono">
                  {editingRole ? 'Rolü Güncelle' : 'Rol Oluştur'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Roles Table */}
        <div className="cyber-card rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border/50">
                <TableHead className="font-mono text-muted-foreground">ROL ADI</TableHead>
                <TableHead className="font-mono text-muted-foreground">AÇIKLAMA</TableHead>
                <TableHead className="font-mono text-muted-foreground">ZAMAN FİLTRESİ</TableHead>
                <TableHead className="font-mono text-muted-foreground">GERÇEK ZAMANLI</TableHead>
                <TableHead className="font-mono text-muted-foreground">İŞLEMLER</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    <span className="text-muted-foreground font-mono animate-pulse">
                      Yükleniyor...
                    </span>
                  </TableCell>
                </TableRow>
              ) : roles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    <span className="text-muted-foreground font-mono">
                      Henüz rol oluşturulmamış
                    </span>
                  </TableCell>
                </TableRow>
              ) : (
                roles.map((role) => (
                  <TableRow key={role.id} className="border-b border-border/30">
                    <TableCell className="font-mono text-sm">
                      <span className="px-2 py-1 bg-primary/20 text-primary rounded">
                        {role.name}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {role.description || '-'}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {role.permissions?.time_filter_minutes
                        ? `Son ${role.permissions.time_filter_minutes} dk`
                        : 'Tümü'}
                    </TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded text-xs font-mono ${
                        role.permissions?.realtime_enabled
                          ? 'bg-primary/20 text-primary'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {role.permissions?.realtime_enabled ? 'Aktif' : 'Pasif'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(role)}
                          className="hover:bg-primary/10 hover:text-primary"
                        >
                          <Edit size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteRole(role.id)}
                          className="hover:bg-destructive/10 hover:text-destructive"
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
