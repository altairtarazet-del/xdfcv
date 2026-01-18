import { useState, useEffect, useCallback } from 'react';
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
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Plus, Key, Mail, RefreshCw, Shield, Eye, EyeOff, Server } from 'lucide-react';

interface Account {
  id: string;
  name?: string;
  address?: string;
}

export default function EmailManagementPage() {
  const { isAdmin, profile } = useAuth();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);

  // Form states
  const [newEmailAddress, setNewEmailAddress] = useState('');
  const [newEmailPassword, setNewEmailPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check permissions
  const canCreateEmail = isAdmin || profile?.permissions?.can_create_email;
  const canChangePassword = isAdmin || profile?.permissions?.can_change_password;

  const fetchAccounts = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('smtp-api', {
        body: { action: 'getAccounts' },
      });

      if (error) throw error;
      const accountList = Array.isArray(data?.accounts) ? data.accounts : [];
      setAccounts(accountList);
    } catch (error: any) {
      console.error('Error fetching accounts:', error);
      toast({
        variant: 'destructive',
        title: 'Hata',
        description: 'Hesaplar yüklenirken bir hata oluştu',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleCreateEmail = async () => {
    if (!newEmailAddress) {
      toast({
        variant: 'destructive',
        title: 'Hata',
        description: 'Email adresi zorunludur',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('smtp-api', {
        body: {
          action: 'createAccount',
          email: newEmailAddress,
          password: newEmailPassword,
        },
      });

      if (error) throw error;

      toast({
        title: 'Başarılı',
        description: 'Email hesabı oluşturuldu',
      });

      setIsCreateDialogOpen(false);
      setNewEmailAddress('');
      setNewEmailPassword('');
      fetchAccounts();
    } catch (error: any) {
      console.error('Error creating email:', error);
      toast({
        variant: 'destructive',
        title: 'Hata',
        description: error.message || 'Email oluşturulurken bir hata oluştu',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChangePassword = async () => {
    if (!selectedAccount) return;

    if (!newPassword) {
      toast({
        variant: 'destructive',
        title: 'Hata',
        description: 'Yeni şifre zorunludur',
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        variant: 'destructive',
        title: 'Hata',
        description: 'Şifreler eşleşmiyor',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('smtp-api', {
        body: {
          action: 'changePassword',
          accountId: selectedAccount.id,
          password: newPassword,
        },
      });

      if (error) throw error;

      toast({
        title: 'Başarılı',
        description: 'Şifre değiştirildi',
      });

      setIsPasswordDialogOpen(false);
      setSelectedAccount(null);
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      console.error('Error changing password:', error);
      toast({
        variant: 'destructive',
        title: 'Hata',
        description: error.message || 'Şifre değiştirilirken bir hata oluştu',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openPasswordDialog = (account: Account) => {
    setSelectedAccount(account);
    setNewPassword('');
    setConfirmPassword('');
    setIsPasswordDialogOpen(true);
  };

  // Access control
  if (!canCreateEmail && !canChangePassword) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <Shield size={48} className="mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-mono text-foreground">Erişim Engellendi</h2>
            <p className="text-muted-foreground font-mono text-sm">
              Bu sayfayı görüntülemek için yetkiniz yok
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
              Email Yönetimi
            </h1>
            <p className="text-muted-foreground font-mono text-sm">
              Email hesaplarını oluşturun ve yönetin
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={fetchAccounts}
              className="hover:bg-primary/10"
            >
              <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            </Button>

            {canCreateEmail && (
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="cyber-glow font-mono">
                    <Plus size={18} className="mr-2" />
                    Yeni Email
                  </Button>
                </DialogTrigger>
                <DialogContent className="cyber-card border-primary/30">
                  <DialogHeader>
                    <DialogTitle className="font-mono text-foreground flex items-center gap-2">
                      <Mail size={20} className="text-primary" />
                      Yeni Email Hesabı
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <Label className="text-muted-foreground font-mono text-xs">
                        EMAIL ADRESİ
                      </Label>
                      <Input
                        type="email"
                        value={newEmailAddress}
                        onChange={(e) => setNewEmailAddress(e.target.value)}
                        className="cyber-input font-mono"
                        placeholder="user@example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-muted-foreground font-mono text-xs">
                        ŞİFRE (Opsiyonel)
                      </Label>
                      <div className="relative">
                        <Input
                          type={showPassword ? 'text' : 'password'}
                          value={newEmailPassword}
                          onChange={(e) => setNewEmailPassword(e.target.value)}
                          className="cyber-input font-mono pr-10"
                          placeholder="Boş bırakılırsa otomatik oluşturulur"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                    <Button
                      onClick={handleCreateEmail}
                      disabled={isSubmitting}
                      className="w-full cyber-glow font-mono"
                    >
                      {isSubmitting ? 'Oluşturuluyor...' : 'Email Oluştur'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        {/* Accounts Table */}
        <div className="cyber-card rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border/50">
                <TableHead className="font-mono text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Server size={14} />
                    HESAP ID
                  </div>
                </TableHead>
                <TableHead className="font-mono text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Mail size={14} />
                    EMAIL ADRESİ
                  </div>
                </TableHead>
                <TableHead className="font-mono text-muted-foreground">İŞLEMLER</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8">
                    <span className="text-muted-foreground font-mono animate-pulse">
                      Yükleniyor...
                    </span>
                  </TableCell>
                </TableRow>
              ) : accounts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8">
                    <Mail size={32} className="mx-auto text-muted-foreground mb-2" />
                    <span className="text-muted-foreground font-mono">
                      Henüz email hesabı yok
                    </span>
                  </TableCell>
                </TableRow>
              ) : (
                accounts.map((account) => (
                  <TableRow key={account.id} className="border-b border-border/30">
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {account.id}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      <span className="px-2 py-1 bg-primary/20 text-primary rounded">
                        {account.address || account.name || '-'}
                      </span>
                    </TableCell>
                    <TableCell>
                      {canChangePassword && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openPasswordDialog(account)}
                          className="hover:bg-primary/10 hover:text-primary font-mono text-xs"
                        >
                          <Key size={14} className="mr-1" />
                          Şifre Değiştir
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Change Password Dialog */}
        <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
          <DialogContent className="cyber-card border-primary/30">
            <DialogHeader>
              <DialogTitle className="font-mono text-foreground flex items-center gap-2">
                <Key size={20} className="text-primary" />
                Şifre Değiştir
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="p-3 bg-muted/30 rounded-lg">
                <p className="text-xs text-muted-foreground font-mono">Hesap:</p>
                <p className="font-mono text-sm text-primary">
                  {selectedAccount?.address || selectedAccount?.name || selectedAccount?.id}
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground font-mono text-xs">YENİ ŞİFRE</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="cyber-input font-mono pr-10"
                    placeholder="Yeni şifre"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground font-mono text-xs">ŞİFRE TEKRAR</Label>
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="cyber-input font-mono"
                  placeholder="Şifreyi tekrar girin"
                />
              </div>
              <Button
                onClick={handleChangePassword}
                disabled={isSubmitting}
                className="w-full cyber-glow font-mono"
              >
                {isSubmitting ? 'Değiştiriliyor...' : 'Şifreyi Değiştir'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
