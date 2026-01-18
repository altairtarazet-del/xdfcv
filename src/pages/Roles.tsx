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
import { Plus, Trash2, Edit, Shield, Clock, Mail, Users, GripVertical, Key, PlusCircle, Wallet, DollarSign, RefreshCcw, Settings, Eye } from 'lucide-react';
import { CustomRole, RolePermission } from '@/types/auth';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from '@dnd-kit/core';
import {
  useSortable,
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface RoleWithPermissions extends CustomRole {
  permissions?: RolePermission | null;
}

interface PermissionItem {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  type: 'toggle' | 'input' | 'textarea';
  inputType?: string;
  placeholder?: string;
}

const availablePermissions: PermissionItem[] = [
  {
    id: 'realtime_enabled',
    label: 'Gerçek Zamanlı Güncelleme',
    description: 'Yeni mail geldiğinde otomatik güncelle',
    icon: <Clock size={16} />,
    type: 'toggle',
  },
  {
    id: 'can_create_email',
    label: 'Email Oluşturma',
    description: 'Yeni mail hesabı oluşturabilir',
    icon: <PlusCircle size={16} />,
    type: 'toggle',
  },
  {
    id: 'can_change_password',
    label: 'Şifre Değiştirme',
    description: 'Mail hesabı şifresi değiştirebilir',
    icon: <Key size={16} />,
    type: 'toggle',
  },
  {
    id: 'can_delete_account',
    label: 'Hesap Silme',
    description: 'Mail hesabını silebilir',
    icon: <Trash2 size={16} />,
    type: 'toggle',
  },
  {
    id: 'can_delete_emails',
    label: 'Tüm Mailleri Silme',
    description: 'Hesaptaki tüm mailleri silebilir (inbox + çöp kutusu)',
    icon: <Trash2 size={16} />,
    type: 'toggle',
  },
  {
    id: 'can_edit_background',
    label: 'Background Düzenleme',
    description: 'Background sayfasında isim ve doğum tarihi düzenleyebilir',
    icon: <Edit size={16} />,
    type: 'toggle',
  },
  // Cash/Kasa permissions
  {
    id: 'can_view_cash',
    label: 'Kasa Görüntüleme',
    description: 'Kasa sayfasını ve işlemleri görebilir',
    icon: <Eye size={16} />,
    type: 'toggle',
  },
  {
    id: 'can_manage_cash',
    label: 'Kasa Yönetimi',
    description: 'Kasa işlemlerini yönetebilir (tüm yetkiler)',
    icon: <Wallet size={16} />,
    type: 'toggle',
  },
  {
    id: 'can_add_payment',
    label: 'Ödeme Ekleme',
    description: 'Yeni ödeme kaydı ekleyebilir',
    icon: <DollarSign size={16} />,
    type: 'toggle',
  },
  {
    id: 'can_process_refund',
    label: 'İade İşleme',
    description: 'İade işlemi yapabilir',
    icon: <RefreshCcw size={16} />,
    type: 'toggle',
  },
  {
    id: 'can_edit_cash_settings',
    label: 'Kasa Ayarları',
    description: 'Varsayılan ödeme tutarlarını düzenleyebilir',
    icon: <Settings size={16} />,
    type: 'toggle',
  },
  {
    id: 'time_filter_minutes',
    label: 'Zaman Filtresi',
    description: 'Sadece son X dakikadaki mailleri görebilir',
    icon: <Clock size={16} />,
    type: 'input',
    inputType: 'number',
    placeholder: 'Dakika (örn: 20)',
  },
  {
    id: 'allowed_mailboxes',
    label: 'İzin Verilen Posta Kutuları',
    description: 'Sadece belirtilen posta kutularını görebilir',
    icon: <Mail size={16} />,
    type: 'textarea',
    placeholder: 'mailbox-id-1, mailbox-id-2',
  },
  {
    id: 'allowed_senders',
    label: 'İzin Verilen Göndericiler',
    description: 'Sadece belirtilen göndericilerden gelen mailleri görebilir',
    icon: <Users size={16} />,
    type: 'textarea',
    placeholder: 'no-reply@doordash.com, *@uber.com',
  },
  {
    id: 'allowed_subjects',
    label: 'İzin Verilen Konu Başlıkları',
    description: 'Sadece belirtilen konu başlıklarını içeren mailleri gösterir (*code* gibi wildcard destekler)',
    icon: <Mail size={16} />,
    type: 'textarea',
    placeholder: 'Checkr: One-time access code confirmation, *verification*',
  },
  {
    id: 'allowed_receivers',
    label: 'İzin Verilen Alıcılar',
    description: 'Sadece belirtilen alıcılara gelen mailleri görebilir',
    icon: <Users size={16} />,
    type: 'textarea',
    placeholder: 'receiver@example.com',
  },
];

interface DraggablePermissionProps {
  permission: PermissionItem;
  value: any;
  onChange: (value: any) => void;
  isActive?: boolean;
}

function DraggablePermission({ permission, value, onChange, isActive }: DraggablePermissionProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: permission.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`cyber-card p-4 rounded-lg border ${
        isActive ? 'border-primary/50 bg-primary/5' : 'border-border/30'
      } ${isDragging ? 'shadow-lg' : ''}`}
    >
      <div className="flex items-start gap-3">
        <button
          {...attributes}
          {...listeners}
          className="mt-1 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-primary"
        >
          <GripVertical size={18} />
        </button>

        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-primary">{permission.icon}</span>
            <span className="font-mono text-sm font-medium text-foreground">
              {permission.label}
            </span>
          </div>
          <p className="text-xs text-muted-foreground font-mono mb-3">
            {permission.description}
          </p>

          {permission.type === 'toggle' && (
            <Switch
              checked={!!value}
              onCheckedChange={onChange}
            />
          )}

          {permission.type === 'input' && (
            <Input
              type={permission.inputType}
              value={value || ''}
              onChange={(e) => onChange(e.target.value)}
              className="cyber-input font-mono text-sm"
              placeholder={permission.placeholder}
            />
          )}

          {permission.type === 'textarea' && (
            <Textarea
              value={value || ''}
              onChange={(e) => onChange(e.target.value)}
              className="cyber-input font-mono text-sm resize-none"
              placeholder={permission.placeholder}
              rows={2}
            />
          )}
        </div>
      </div>
    </div>
  );
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
  const [permissionValues, setPermissionValues] = useState<Record<string, any>>({
    realtime_enabled: true,
    can_create_email: false,
    can_change_password: false,
    can_delete_account: false,
    can_delete_emails: false,
    can_edit_background: false,
    can_view_cash: false,
    can_manage_cash: false,
    can_add_payment: false,
    can_process_refund: false,
    can_edit_cash_settings: false,
    time_filter_minutes: '',
    allowed_mailboxes: '',
    allowed_senders: '',
    allowed_subjects: '',
    allowed_receivers: '',
  });
  const [activePermissions, setActivePermissions] = useState<string[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  );

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

      const rolesWithPermissions: RoleWithPermissions[] = await Promise.all(
        (rolesData || []).map(async (role) => {
          const { data: permData } = await supabase
            .from('role_permissions')
            .select('*')
            .eq('custom_role_id', role.id)
            .maybeSingle();

          return {
            ...role,
            permissions: permData as RolePermission | null,
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
        const { error } = await supabase
          .from('custom_roles')
          .update({
            name: formName,
            description: formDescription || null,
          })
          .eq('id', editingRole.id);

        if (error) throw error;
      } else {
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

      if (roleId) {
        const permissions = {
          custom_role_id: roleId,
          time_filter_minutes: permissionValues.time_filter_minutes 
            ? parseInt(permissionValues.time_filter_minutes) 
            : null,
          allowed_mailboxes: permissionValues.allowed_mailboxes 
            ? permissionValues.allowed_mailboxes.split(',').map((s: string) => s.trim()).filter(Boolean) 
            : null,
          allowed_senders: permissionValues.allowed_senders 
            ? permissionValues.allowed_senders.split(',').map((s: string) => s.trim()).filter(Boolean) 
            : null,
          allowed_subjects: permissionValues.allowed_subjects 
            ? permissionValues.allowed_subjects.split(',').map((s: string) => s.trim()).filter(Boolean) 
            : null,
          allowed_receivers: permissionValues.allowed_receivers 
            ? permissionValues.allowed_receivers.split(',').map((s: string) => s.trim()).filter(Boolean) 
            : null,
          realtime_enabled: !!permissionValues.realtime_enabled,
          can_create_email: !!permissionValues.can_create_email,
          can_change_password: !!permissionValues.can_change_password,
          can_delete_account: !!permissionValues.can_delete_account,
          can_delete_emails: !!permissionValues.can_delete_emails,
          can_edit_background: !!permissionValues.can_edit_background,
          can_view_cash: !!permissionValues.can_view_cash,
          can_manage_cash: !!permissionValues.can_manage_cash,
          can_add_payment: !!permissionValues.can_add_payment,
          can_process_refund: !!permissionValues.can_process_refund,
          can_edit_cash_settings: !!permissionValues.can_edit_cash_settings,
        };

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
    
    const perms = role.permissions;
    setPermissionValues({
      realtime_enabled: perms?.realtime_enabled ?? true,
      can_create_email: perms?.can_create_email ?? false,
      can_change_password: perms?.can_change_password ?? false,
      can_delete_account: perms?.can_delete_account ?? false,
      can_delete_emails: perms?.can_delete_emails ?? false,
      can_edit_background: perms?.can_edit_background ?? false,
      can_view_cash: (perms as any)?.can_view_cash ?? false,
      can_manage_cash: (perms as any)?.can_manage_cash ?? false,
      can_add_payment: (perms as any)?.can_add_payment ?? false,
      can_process_refund: (perms as any)?.can_process_refund ?? false,
      can_edit_cash_settings: (perms as any)?.can_edit_cash_settings ?? false,
      time_filter_minutes: perms?.time_filter_minutes?.toString() || '',
      allowed_mailboxes: perms?.allowed_mailboxes?.join(', ') || '',
      allowed_senders: perms?.allowed_senders?.join(', ') || '',
      allowed_subjects: perms?.allowed_subjects?.join(', ') || '',
      allowed_receivers: perms?.allowed_receivers?.join(', ') || '',
    });

    // Set active permissions based on which ones have values
    const active: string[] = [];
    if (perms?.realtime_enabled) active.push('realtime_enabled');
    if (perms?.can_create_email) active.push('can_create_email');
    if (perms?.can_change_password) active.push('can_change_password');
    if (perms?.can_delete_account) active.push('can_delete_account');
    if (perms?.can_delete_emails) active.push('can_delete_emails');
    if (perms?.can_edit_background) active.push('can_edit_background');
    if ((perms as any)?.can_view_cash) active.push('can_view_cash');
    if ((perms as any)?.can_manage_cash) active.push('can_manage_cash');
    if ((perms as any)?.can_add_payment) active.push('can_add_payment');
    if ((perms as any)?.can_process_refund) active.push('can_process_refund');
    if ((perms as any)?.can_edit_cash_settings) active.push('can_edit_cash_settings');
    if (perms?.time_filter_minutes) active.push('time_filter_minutes');
    if (perms?.allowed_mailboxes?.length) active.push('allowed_mailboxes');
    if (perms?.allowed_senders?.length) active.push('allowed_senders');
    if (perms?.allowed_subjects?.length) active.push('allowed_subjects');
    if (perms?.allowed_receivers?.length) active.push('allowed_receivers');
    setActivePermissions(active);

    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setFormName('');
    setFormDescription('');
    setPermissionValues({
      realtime_enabled: true,
      can_create_email: false,
      can_change_password: false,
      can_delete_account: false,
      can_delete_emails: false,
      can_edit_background: false,
      can_view_cash: false,
      can_manage_cash: false,
      can_add_payment: false,
      can_process_refund: false,
      can_edit_cash_settings: false,
      time_filter_minutes: '',
      allowed_mailboxes: '',
      allowed_senders: '',
      allowed_subjects: '',
      allowed_receivers: '',
    });
    setActivePermissions([]);
    setEditingRole(null);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setDraggedId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggedId(null);
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = activePermissions.indexOf(active.id as string);
      const newIndex = activePermissions.indexOf(over.id as string);

      const newOrder = [...activePermissions];
      newOrder.splice(oldIndex, 1);
      newOrder.splice(newIndex, 0, active.id as string);
      setActivePermissions(newOrder);
    }
  };

  const togglePermission = (permId: string) => {
    if (activePermissions.includes(permId)) {
      setActivePermissions(activePermissions.filter(id => id !== permId));
      // Reset value when removing
      const perm = availablePermissions.find(p => p.id === permId);
      if (perm?.type === 'toggle') {
        setPermissionValues(prev => ({ ...prev, [permId]: false }));
      } else {
        setPermissionValues(prev => ({ ...prev, [permId]: '' }));
      }
    } else {
      setActivePermissions([...activePermissions, permId]);
      // Set default value when adding
      const perm = availablePermissions.find(p => p.id === permId);
      if (perm?.type === 'toggle') {
        setPermissionValues(prev => ({ ...prev, [permId]: true }));
      }
    }
  };

  const updatePermissionValue = (permId: string, value: any) => {
    setPermissionValues(prev => ({ ...prev, [permId]: value }));
  };

  const getActivePermissionObjects = () => {
    return activePermissions
      .map(id => availablePermissions.find(p => p.id === id))
      .filter(Boolean) as PermissionItem[];
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
              Özel roller ve izinleri yönetin - Sürükle bırak ile yetki atayın
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
            <DialogContent className="cyber-card border-primary/30 max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
              <DialogHeader>
                <DialogTitle className="font-mono text-foreground">
                  {editingRole ? 'Rol Düzenle' : 'Yeni Rol Oluştur'}
                </DialogTitle>
              </DialogHeader>
              
              <div className="flex-1 overflow-y-auto pr-2 space-y-6 mt-4">
                {/* Basic Info */}
                <div className="space-y-4">
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
                </div>

                {/* Permission Selection */}
                <div className="border-t border-border/30 pt-4">
                  <h3 className="text-sm font-mono text-foreground mb-3 flex items-center gap-2">
                    <Shield size={16} className="text-primary" />
                    Mevcut Yetkiler
                  </h3>
                  <p className="text-xs text-muted-foreground font-mono mb-4">
                    Rol için eklemek istediğiniz yetkilere tıklayın
                  </p>
                  
                  <div className="flex flex-wrap gap-2 mb-6">
                    {availablePermissions.map((perm) => (
                      <button
                        key={perm.id}
                        onClick={() => togglePermission(perm.id)}
                        className={`px-3 py-2 rounded-lg font-mono text-xs flex items-center gap-2 transition-all ${
                          activePermissions.includes(perm.id)
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        {perm.icon}
                        {perm.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Active Permissions - Drag & Drop */}
                {activePermissions.length > 0 && (
                  <div className="border-t border-border/30 pt-4">
                    <h3 className="text-sm font-mono text-foreground mb-3 flex items-center gap-2">
                      <GripVertical size={16} className="text-primary" />
                      Atanan Yetkiler
                    </h3>
                    <p className="text-xs text-muted-foreground font-mono mb-4">
                      Sürükleyerek sıralayın, değerleri ayarlayın
                    </p>

                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext
                        items={activePermissions}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-3">
                          {getActivePermissionObjects().map((perm) => (
                            <DraggablePermission
                              key={perm.id}
                              permission={perm}
                              value={permissionValues[perm.id]}
                              onChange={(val) => updatePermissionValue(perm.id, val)}
                              isActive={activePermissions.includes(perm.id)}
                            />
                          ))}
                        </div>
                      </SortableContext>
                      <DragOverlay>
                        {draggedId ? (
                          <div className="cyber-card p-4 rounded-lg border border-primary shadow-lg opacity-90">
                            <span className="font-mono text-sm">
                              {availablePermissions.find(p => p.id === draggedId)?.label}
                            </span>
                          </div>
                        ) : null}
                      </DragOverlay>
                    </DndContext>
                  </div>
                )}

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
                <TableHead className="font-mono text-muted-foreground">YETKİLER</TableHead>
                <TableHead className="font-mono text-muted-foreground">İŞLEMLER</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8">
                    <span className="text-muted-foreground font-mono animate-pulse">
                      Yükleniyor...
                    </span>
                  </TableCell>
                </TableRow>
              ) : roles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8">
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
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {role.permissions?.realtime_enabled && (
                          <span className="px-2 py-0.5 bg-primary/20 text-primary rounded text-xs font-mono">
                            Canlı
                          </span>
                        )}
                        {role.permissions?.can_create_email && (
                          <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs font-mono">
                            Mail Oluştur
                          </span>
                        )}
                        {role.permissions?.can_change_password && (
                          <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded text-xs font-mono">
                            Şifre Değiştir
                          </span>
                        )}
                        {role.permissions?.time_filter_minutes && (
                          <span className="px-2 py-0.5 bg-muted text-muted-foreground rounded text-xs font-mono">
                            {role.permissions.time_filter_minutes}dk
                          </span>
                        )}
                        {role.permissions?.allowed_senders?.length ? (
                          <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs font-mono">
                            {role.permissions.allowed_senders.length} gönderici
                          </span>
                        ) : null}
                      </div>
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
