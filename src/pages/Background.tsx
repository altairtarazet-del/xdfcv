import { useState, useEffect, useCallback, useMemo } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { RefreshCw, Shield, FileSearch, Search, Mail, Calendar, X, User, Copy, Edit, Download } from 'lucide-react';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

interface EmailAccount {
  id: string;
  email: string;
  date_of_birth: string;
  created_at: string;
  created_by: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
}

export default function BackgroundPage() {
  const { isAdmin, profile } = useAuth();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Edit dialog state
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<EmailAccount | null>(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editMiddleName, setEditMiddleName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editDobDay, setEditDobDay] = useState('');
  const [editDobMonth, setEditDobMonth] = useState('');
  const [editDobYear, setEditDobYear] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check permissions
  const canManageEmails = isAdmin || profile?.permissions?.can_create_email || profile?.permissions?.can_change_password;
  const canEditBackground = isAdmin || profile?.permissions?.can_edit_background;

  const fetchAccounts = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('email_accounts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAccounts(data || []);
    } catch (error: any) {
      console.error('Error fetching email accounts:', error);
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

  // Sync SMTP accounts to database
  const handleSyncAccounts = async () => {
    setIsSyncing(true);
    try {
      // Fetch all accounts from SMTP API
      const { data: smtpData, error: smtpError } = await supabase.functions.invoke('smtp-api', {
        body: { action: 'getAccounts', page: 1 },
      });

      if (smtpError) throw smtpError;

      const smtpAccounts = smtpData?.accounts || [];
      let syncedCount = 0;

      // Get current user ID
      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;

      for (const smtpAccount of smtpAccounts) {
        const email = smtpAccount.address || smtpAccount.name;
        if (!email) continue;

        // Check if already exists
        const { data: existing } = await supabase
          .from('email_accounts')
          .select('id')
          .eq('email', email)
          .maybeSingle();

        if (!existing) {
          // Extract name parts from email
          const localPart = email.split('@')[0];
          const parts = localPart
            .replace(/[._]/g, ' ')
            .replace(/\d+/g, '')
            .trim()
            .split(' ')
            .filter(Boolean)
            .map((word: string) => word.toUpperCase());

          let firstName = '';
          let middleName = '';
          let lastName = '';

          if (parts.length === 1) {
            firstName = parts[0];
          } else if (parts.length === 2) {
            firstName = parts[0];
            lastName = parts[1];
          } else if (parts.length >= 3) {
            firstName = parts[0];
            middleName = parts.slice(1, -1).join(' ');
            lastName = parts[parts.length - 1];
          }

          // Insert with default DOB (will need to be updated)
          const { error: insertError } = await supabase
            .from('email_accounts')
            .insert({
              email,
              date_of_birth: '1990-01-01', // Default - needs to be updated
              created_by: userId,
              first_name: firstName || null,
              middle_name: middleName || null,
              last_name: lastName || null,
            });

          if (!insertError) {
            syncedCount++;
          }
        }
      }

      toast({
        title: 'Senkronizasyon Tamamlandı',
        description: `${syncedCount} yeni hesap eklendi`,
      });

      fetchAccounts();
    } catch (error: any) {
      console.error('Error syncing accounts:', error);
      toast({
        variant: 'destructive',
        title: 'Hata',
        description: 'Senkronizasyon sırasında bir hata oluştu',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const formatDateOfBirth = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return format(date, 'MM/dd/yyyy', { locale: tr });
    } catch {
      return dateString;
    }
  };

  // Get name parts - use saved values if available, otherwise extract from email
  const getNameParts = (account: EmailAccount) => {
    if (account.first_name || account.last_name) {
      return {
        first: account.first_name || '',
        middle: account.middle_name || '',
        last: account.last_name || '',
      };
    }
    
    const localPart = account.email.split('@')[0];
    const parts = localPart
      .replace(/[._]/g, ' ')
      .replace(/\d+/g, '')
      .trim()
      .split(' ')
      .filter(Boolean)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
    
    if (parts.length === 0) {
      return { first: localPart, middle: '', last: '' };
    } else if (parts.length === 1) {
      return { first: parts[0], middle: '', last: '' };
    } else if (parts.length === 2) {
      return { first: parts[0], middle: '', last: parts[1] };
    } else {
      return { 
        first: parts[0], 
        middle: parts.slice(1, -1).join(' '), 
        last: parts[parts.length - 1] 
      };
    }
  };

  // Copy to clipboard
  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: 'Kopyalandı',
        description: `${label} panoya kopyalandı`,
      });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Hata',
        description: 'Kopyalama başarısız',
      });
    }
  };

  // Open edit dialog
  const openEditDialog = (account: EmailAccount) => {
    setEditingAccount(account);
    setEditFirstName(account.first_name || '');
    setEditMiddleName(account.middle_name || '');
    setEditLastName(account.last_name || '');
    
    // Parse DOB
    try {
      const date = new Date(account.date_of_birth);
      setEditDobDay(date.getDate().toString());
      setEditDobMonth((date.getMonth() + 1).toString());
      setEditDobYear(date.getFullYear().toString());
    } catch {
      setEditDobDay('');
      setEditDobMonth('');
      setEditDobYear('');
    }
    
    setIsEditDialogOpen(true);
  };

  // Save edited account
  const handleSaveEdit = async () => {
    if (!editingAccount) return;

    if (!editDobDay || !editDobMonth || !editDobYear) {
      toast({
        variant: 'destructive',
        title: 'Hata',
        description: 'Doğum tarihi zorunludur',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const dateOfBirth = `${editDobYear}-${editDobMonth.padStart(2, '0')}-${editDobDay.padStart(2, '0')}`;

      const { error } = await supabase
        .from('email_accounts')
        .update({
          first_name: editFirstName.toUpperCase() || null,
          middle_name: editMiddleName.toUpperCase() || null,
          last_name: editLastName.toUpperCase() || null,
          date_of_birth: dateOfBirth,
        })
        .eq('id', editingAccount.id);

      if (error) throw error;

      toast({
        title: 'Başarılı',
        description: 'Hesap bilgileri güncellendi',
      });

      setIsEditDialogOpen(false);
      setEditingAccount(null);
      fetchAccounts();
    } catch (error: any) {
      console.error('Error updating account:', error);
      toast({
        variant: 'destructive',
        title: 'Hata',
        description: 'Güncelleme sırasında bir hata oluştu',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter accounts based on search query
  const filteredAccounts = useMemo(() => {
    if (!searchQuery.trim()) return accounts;
    
    const query = searchQuery.toLowerCase().trim();
    return accounts.filter((account) => {
      const email = account.email.toLowerCase();
      const dob = formatDateOfBirth(account.date_of_birth).toLowerCase();
      const firstName = (account.first_name || '').toLowerCase();
      const lastName = (account.last_name || '').toLowerCase();
      return email.includes(query) || dob.includes(query) || firstName.includes(query) || lastName.includes(query);
    });
  }, [accounts, searchQuery]);

  // Generate day options
  const dayOptions = Array.from({ length: 31 }, (_, i) => i + 1);
  const monthOptions = [
    { value: '1', label: 'Ocak' },
    { value: '2', label: 'Şubat' },
    { value: '3', label: 'Mart' },
    { value: '4', label: 'Nisan' },
    { value: '5', label: 'Mayıs' },
    { value: '6', label: 'Haziran' },
    { value: '7', label: 'Temmuz' },
    { value: '8', label: 'Ağustos' },
    { value: '9', label: 'Eylül' },
    { value: '10', label: 'Ekim' },
    { value: '11', label: 'Kasım' },
    { value: '12', label: 'Aralık' },
  ];
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 80 }, (_, i) => currentYear - 18 - i);

  // Access control
  if (!canManageEmails) {
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
              Background Kontrol
            </h1>
            <p className="text-muted-foreground font-mono text-sm">
              Email hesaplarının background check bilgilerini yönetin
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSyncAccounts}
                disabled={isSyncing}
                className="hover:bg-primary/10 font-mono text-xs"
              >
                <Download size={14} className={`mr-1 ${isSyncing ? 'animate-bounce' : ''}`} />
                {isSyncing ? 'Senkronize ediliyor...' : 'SMTP Senkronize Et'}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={fetchAccounts}
              className="hover:bg-primary/10"
            >
              <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            </Button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Email, isim veya doğum tarihine göre ara..."
            className="cyber-input font-mono pl-10 pr-10"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Accounts Table */}
        <div className="cyber-card rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border/50">
                <TableHead className="font-mono text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <User size={14} />
                    FIRST NAME
                  </div>
                </TableHead>
                <TableHead className="font-mono text-muted-foreground">MIDDLE NAME</TableHead>
                <TableHead className="font-mono text-muted-foreground">LAST NAME</TableHead>
                <TableHead className="font-mono text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Mail size={14} />
                    EMAIL
                  </div>
                </TableHead>
                <TableHead className="font-mono text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Calendar size={14} />
                    DOĞUM TARİHİ
                  </div>
                </TableHead>
                <TableHead className="font-mono text-muted-foreground">İŞLEMLER</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <span className="text-muted-foreground font-mono animate-pulse">
                      Yükleniyor...
                    </span>
                  </TableCell>
                </TableRow>
              ) : filteredAccounts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <FileSearch size={32} className="mx-auto text-muted-foreground mb-2" />
                    <span className="text-muted-foreground font-mono">
                      {searchQuery ? 'Arama sonucu bulunamadı' : 'Henüz kayıtlı email hesabı yok'}
                    </span>
                    {!searchQuery && (
                      <p className="text-muted-foreground font-mono text-xs mt-1">
                        Email oluşturma sayfasından yeni hesap ekleyebilirsiniz
                      </p>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                filteredAccounts.map((account) => {
                  const nameParts = getNameParts(account);
                  const dob = formatDateOfBirth(account.date_of_birth);
                  return (
                    <TableRow key={account.id} className="border-b border-border/30">
                      <TableCell className="font-mono text-sm">
                        <button
                          onClick={() => copyToClipboard(nameParts.first, 'First Name')}
                          className="px-2 py-1 bg-secondary/50 text-foreground rounded hover:bg-secondary transition-colors cursor-pointer flex items-center gap-1 group"
                          title="Kopyalamak için tıkla"
                        >
                          {nameParts.first || '-'}
                          <Copy size={12} className="opacity-0 group-hover:opacity-50 transition-opacity" />
                        </button>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {nameParts.middle ? (
                          <button
                            onClick={() => copyToClipboard(nameParts.middle, 'Middle Name')}
                            className="px-2 py-1 bg-secondary/50 text-foreground rounded hover:bg-secondary transition-colors cursor-pointer flex items-center gap-1 group"
                            title="Kopyalamak için tıkla"
                          >
                            {nameParts.middle}
                            <Copy size={12} className="opacity-0 group-hover:opacity-50 transition-opacity" />
                          </button>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {nameParts.last ? (
                          <button
                            onClick={() => copyToClipboard(nameParts.last, 'Last Name')}
                            className="px-2 py-1 bg-secondary/50 text-foreground rounded hover:bg-secondary transition-colors cursor-pointer flex items-center gap-1 group"
                            title="Kopyalamak için tıkla"
                          >
                            {nameParts.last}
                            <Copy size={12} className="opacity-0 group-hover:opacity-50 transition-opacity" />
                          </button>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        <button
                          onClick={() => copyToClipboard(account.email, 'Email')}
                          className="px-2 py-1 bg-primary/20 text-primary rounded hover:bg-primary/30 transition-colors cursor-pointer flex items-center gap-1 group"
                          title="Kopyalamak için tıkla"
                        >
                          {account.email}
                          <Copy size={12} className="opacity-0 group-hover:opacity-50 transition-opacity" />
                        </button>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        <button
                          onClick={() => copyToClipboard(dob, 'Doğum tarihi')}
                          className="text-foreground hover:text-primary transition-colors cursor-pointer flex items-center gap-1 group"
                          title="Kopyalamak için tıkla"
                        >
                          {dob}
                          <Copy size={12} className="opacity-0 group-hover:opacity-50 transition-opacity" />
                        </button>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {canEditBackground && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEditDialog(account)}
                              className="hover:bg-primary/10 hover:text-primary hover:border-primary font-mono text-xs"
                            >
                              <Edit size={14} className="mr-1" />
                              Düzenle
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          {/* Total Count */}
          {accounts.length > 0 && (
            <div className="flex items-center justify-between p-4 border-t border-border/30">
              <span className="font-mono text-xs text-muted-foreground">
                {searchQuery 
                  ? `${filteredAccounts.length} / ${accounts.length} hesap gösteriliyor`
                  : `Toplam: ${accounts.length} hesap`
                }
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="cyber-card border-primary/30">
          <DialogHeader>
            <DialogTitle className="font-mono text-foreground flex items-center gap-2">
              <Edit size={20} className="text-primary" />
              Hesap Bilgilerini Düzenle
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {/* Email (read-only) */}
            <div className="space-y-2">
              <Label className="text-muted-foreground font-mono text-xs">EMAIL</Label>
              <Input
                value={editingAccount?.email || ''}
                disabled
                className="cyber-input font-mono opacity-50"
              />
            </div>

            {/* First Name */}
            <div className="space-y-2">
              <Label className="text-muted-foreground font-mono text-xs">FIRST NAME *</Label>
              <Input
                value={editFirstName}
                onChange={(e) => setEditFirstName(e.target.value.toUpperCase())}
                className="cyber-input font-mono"
                placeholder="JOHN"
              />
            </div>

            {/* Middle Name */}
            <div className="space-y-2">
              <Label className="text-muted-foreground font-mono text-xs">MIDDLE NAME</Label>
              <Input
                value={editMiddleName}
                onChange={(e) => setEditMiddleName(e.target.value.toUpperCase())}
                className="cyber-input font-mono"
                placeholder="WILLIAM"
              />
            </div>

            {/* Last Name */}
            <div className="space-y-2">
              <Label className="text-muted-foreground font-mono text-xs">LAST NAME *</Label>
              <Input
                value={editLastName}
                onChange={(e) => setEditLastName(e.target.value.toUpperCase())}
                className="cyber-input font-mono"
                placeholder="DOE"
              />
            </div>

            {/* DOB */}
            <div className="space-y-2">
              <Label className="text-muted-foreground font-mono text-xs flex items-center gap-2">
                <Calendar size={14} />
                DOĞUM TARİHİ *
              </Label>
              <div className="grid grid-cols-3 gap-2">
                <Select value={editDobDay} onValueChange={setEditDobDay}>
                  <SelectTrigger className="cyber-input font-mono">
                    <SelectValue placeholder="Gün" />
                  </SelectTrigger>
                  <SelectContent>
                    {dayOptions.map((day) => (
                      <SelectItem key={day} value={day.toString()}>
                        {day}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={editDobMonth} onValueChange={setEditDobMonth}>
                  <SelectTrigger className="cyber-input font-mono">
                    <SelectValue placeholder="Ay" />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map((month) => (
                      <SelectItem key={month.value} value={month.value}>
                        {month.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={editDobYear} onValueChange={setEditDobYear}>
                  <SelectTrigger className="cyber-input font-mono">
                    <SelectValue placeholder="Yıl" />
                  </SelectTrigger>
                  <SelectContent>
                    {yearOptions.map((year) => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              onClick={handleSaveEdit}
              disabled={isSubmitting}
              className="w-full cyber-glow font-mono"
            >
              {isSubmitting ? 'Kaydediliyor...' : 'Kaydet'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}