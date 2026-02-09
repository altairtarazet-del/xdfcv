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
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Shield, FileSearch, Search, Mail, Calendar, X, User, Copy, Edit, Filter, AlertTriangle, Link } from 'lucide-react';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

type AccountStatus = 'acildi' | 'background' | 'aktif' | 'kapandi' | 'suspend';

interface EmailAccount {
  id: string;
  email: string;
  date_of_birth: string;
  created_at: string;
  created_by: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  status: AccountStatus;
}

const statusConfig: Record<AccountStatus, { label: string; color: string; bgColor: string }> = {
  acildi: { label: 'Açıldı', color: 'text-green-400', bgColor: 'bg-green-500/20' },
  background: { label: 'Background', color: 'text-blue-400', bgColor: 'bg-blue-500/20' },
  aktif: { label: 'Aktif', color: 'text-cyan-400', bgColor: 'bg-cyan-500/20' },
  kapandi: { label: 'Kapandı', color: 'text-red-400', bgColor: 'bg-red-500/20' },
  suspend: { label: 'Suspend', color: 'text-orange-400', bgColor: 'bg-orange-500/20' },
};

export default function BackgroundPage() {
  const { isAdmin, profile } = useAuth();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<AccountStatus | 'all'>('all');
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
  const [editStatus, setEditStatus] = useState<AccountStatus>('acildi');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const navigate = useNavigate();

  // BGC status sync
  const [bgcStatusMap, setBgcStatusMap] = useState<Map<string, string>>(new Map());

  // Check permissions
  const canManageEmails = isAdmin || profile?.permissions?.can_create_email || profile?.permissions?.can_change_password;
  const canEditBackground = isAdmin || profile?.permissions?.can_edit_background;
  const canViewBgcComplete = isAdmin || (profile?.permissions as any)?.can_view_bgc_complete;

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

  // Fetch BGC statuses for all accounts
  const fetchBgcStatuses = useCallback(async () => {
    try {
      const { data: emails } = await supabase
        .from('bgc_complete_emails')
        .select('account_email, email_type')
        .order('email_date', { ascending: false });

      if (!emails) return;

      const statusMap = new Map<string, string>();
      for (const email of emails) {
        if (statusMap.has(email.account_email)) continue;
        if (email.email_type === 'deactivated') statusMap.set(email.account_email, 'kapandi');
        else if (email.email_type === 'first_package') statusMap.set(email.account_email, 'aktif');
        else if (email.email_type === 'bgc_complete') statusMap.set(email.account_email, 'aktif');
        else if (email.email_type === 'bgc_submitted') statusMap.set(email.account_email, 'background');
      }
      setBgcStatusMap(statusMap);
    } catch (error) {
      console.error('Error fetching BGC statuses:', error);
    }
  }, []);

  // Check for status mismatch
  const getStatusMismatch = (account: EmailAccount): string | null => {
    const bgcStatus = bgcStatusMap.get(account.email);
    if (!bgcStatus) return null;
    // Check for mismatches
    if (bgcStatus === 'kapandi' && account.status !== 'kapandi') return `BGC: Kapandi`;
    if (bgcStatus === 'aktif' && account.status !== 'aktif') return `BGC: Aktif`;
    if (bgcStatus === 'background' && account.status === 'acildi') return `BGC: Surecte`;
    return null;
  };

  // Auto-sync SMTP accounts on page load (add missing, remove deleted)
  const syncMissingAccounts = useCallback(async () => {
    try {
      // Fetch all pages of SMTP accounts
      let allSmtpAccounts: any[] = [];
      let page = 1;
      let hasMore = true;
      
      while (hasMore) {
        const { data: smtpData, error: smtpError } = await supabase.functions.invoke('smtp-api', {
          body: { action: 'getAccounts', page },
        });

        if (smtpError) throw smtpError;
        
        const smtpAccounts = smtpData?.accounts || [];
        allSmtpAccounts = [...allSmtpAccounts, ...smtpAccounts];
        
        hasMore = !!smtpData?.view?.next;
        page++;
        
        if (page > 50) break;
      }

      // Create a set of SMTP emails for quick lookup
      const smtpEmails = new Set(
        allSmtpAccounts.map(a => (a.address || a.name || '').toLowerCase())
      );

      // Get all existing emails from database
      const existingEmails = new Set(accounts.map(a => a.email.toLowerCase()));
      
      // Get current user ID
      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;

      let syncedCount = 0;
      let deletedCount = 0;
      const newAccounts: any[] = [];

      // 1. Find accounts to ADD (in SMTP but not in DB)
      for (const smtpAccount of allSmtpAccounts) {
        const email = (smtpAccount.address || smtpAccount.name || '').toLowerCase();
        if (!email || existingEmails.has(email)) continue;

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

        newAccounts.push({
          email: smtpAccount.address || smtpAccount.name,
          date_of_birth: '1990-01-01',
          created_by: userId,
          first_name: firstName || null,
          middle_name: middleName || null,
          last_name: lastName || null,
        });
      }

      // 2. Find accounts to DELETE (in DB but not in SMTP)
      const accountsToDelete = accounts.filter(
        dbAccount => !smtpEmails.has(dbAccount.email.toLowerCase())
      );

      // Delete removed accounts from DB
      if (accountsToDelete.length > 0) {
        const idsToDelete = accountsToDelete.map(a => a.id);
        
        const { error: deleteError } = await supabase
          .from('email_accounts')
          .delete()
          .in('id', idsToDelete);

        if (!deleteError) {
          deletedCount = accountsToDelete.length;
        }
      }

      // Insert new accounts
      if (newAccounts.length > 0) {
        const { error: insertError } = await supabase
          .from('email_accounts')
          .insert(newAccounts);

        if (!insertError) {
          syncedCount = newAccounts.length;
        }
      }

      // Refresh accounts list if any changes were made
      if (syncedCount > 0 || deletedCount > 0) {
        const { data: refreshedData } = await supabase
          .from('email_accounts')
          .select('*')
          .order('created_at', { ascending: false });
        
        if (refreshedData) {
          setAccounts(refreshedData);
        }

        const messages: string[] = [];
        if (syncedCount > 0) messages.push(`${syncedCount} yeni hesap eklendi`);
        if (deletedCount > 0) messages.push(`${deletedCount} silinen hesap kaldırıldı`);

        toast({
          title: 'Senkronizasyon',
          description: messages.join(', '),
        });
      }
    } catch (error: any) {
      console.error('Auto-sync error:', error);
    }
  }, [accounts, toast]);

  useEffect(() => {
    fetchAccounts();
    if (canViewBgcComplete) fetchBgcStatuses();
  }, [fetchAccounts, canViewBgcComplete, fetchBgcStatuses]);

  // Run auto-sync after initial load
  useEffect(() => {
    if (!isLoading && accounts.length >= 0) {
      syncMissingAccounts();
    }
  }, [isLoading]); // Only run when loading completes

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
    
    // Set status
    setEditStatus(account.status || 'acildi');
    
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
          status: editStatus,
        } as any)
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

  // Filter accounts based on search query and status
  const filteredAccounts = useMemo(() => {
    let result = accounts;
    
    // Apply status filter
    if (filterStatus !== 'all') {
      result = result.filter((account) => account.status === filterStatus);
    }
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter((account) => {
        const email = account.email.toLowerCase();
        const dob = formatDateOfBirth(account.date_of_birth).toLowerCase();
        const firstName = (account.first_name || '').toLowerCase();
        const lastName = (account.last_name || '').toLowerCase();
        return email.includes(query) || dob.includes(query) || firstName.includes(query) || lastName.includes(query);
      });
    }
    
    return result;
  }, [accounts, searchQuery, filterStatus]);

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
            <h2 className="text-xl font-semibold text-foreground">Erişim Engellendi</h2>
            <p className="text-muted-foreground text-sm">
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
            <h1 className="text-2xl font-bold text-foreground">
              Background Kontrol
            </h1>
            <p className="text-muted-foreground text-sm">
              Email hesaplarının background check bilgilerini yönetin
            </p>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={fetchAccounts}
            className="hover:bg-primary/10"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          </Button>
        </div>

        {/* Search Bar and Filter */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Email, isim veya doğum tarihine göre ara..."
              className="cyber-input pl-10 pr-10"
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
          
          <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as AccountStatus | 'all')}>
            <SelectTrigger className="w-full sm:w-48 cyber-input">
              <Filter size={14} className="mr-2 text-muted-foreground" />
              <SelectValue placeholder="Tüm Durumlar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm Durumlar</SelectItem>
              {Object.entries(statusConfig).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  <span className={config.color}>{config.label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Accounts Table */}
        <div className="cyber-card rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border/50">
                <TableHead className="text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <User size={14} />
                    FIRST NAME
                  </div>
                </TableHead>
                <TableHead className="text-muted-foreground">MIDDLE NAME</TableHead>
                <TableHead className="text-muted-foreground">LAST NAME</TableHead>
                <TableHead className="text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Mail size={14} />
                    EMAIL
                  </div>
                </TableHead>
                <TableHead className="text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Calendar size={14} />
                    DOĞUM TARİHİ
                  </div>
                </TableHead>
                <TableHead className="text-muted-foreground">DURUM</TableHead>
                <TableHead className="text-muted-foreground">İŞLEMLER</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <span className="text-muted-foreground animate-pulse">
                      Yükleniyor...
                    </span>
                  </TableCell>
                </TableRow>
              ) : filteredAccounts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <FileSearch size={32} className="mx-auto text-muted-foreground mb-2" />
                    <span className="text-muted-foreground">
                      {searchQuery ? 'Arama sonucu bulunamadı' : 'Henüz kayıtlı email hesabı yok'}
                    </span>
                    {!searchQuery && (
                      <p className="text-muted-foreground text-xs mt-1">
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
                      <TableCell className="text-sm">
                        <button
                          onClick={() => copyToClipboard(nameParts.first, 'First Name')}
                          className="px-2 py-1 bg-secondary/50 text-foreground rounded hover:bg-secondary transition-colors cursor-pointer flex items-center gap-1 group"
                          title="Kopyalamak için tıkla"
                        >
                          {nameParts.first || '-'}
                          <Copy size={12} className="opacity-0 group-hover:opacity-50 transition-opacity" />
                        </button>
                      </TableCell>
                      <TableCell className="text-sm">
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
                      <TableCell className="text-sm">
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
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {(() => {
                            const status = account.status || 'acildi';
                            const config = statusConfig[status];
                            return (
                              <span className={`px-2 py-1 rounded text-xs font-medium ${config.bgColor} ${config.color}`}>
                                {config.label}
                              </span>
                            );
                          })()}
                          {(() => {
                            const mismatch = getStatusMismatch(account);
                            if (!mismatch) return null;
                            return (
                              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/50 text-[10px] gap-1">
                                <AlertTriangle size={10} />{mismatch}
                              </Badge>
                            );
                          })()}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {canViewBgcComplete && bgcStatusMap.has(account.email) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate(`/dashboard/account/${encodeURIComponent(account.email)}`)}
                              className="text-xs h-7 px-2"
                              title="Hesap Detayi"
                            >
                              <Link size={12} />
                            </Button>
                          )}
                          {canEditBackground && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEditDialog(account)}
                              className="hover:bg-primary/10 hover:text-primary hover:border-primary text-xs"
                            >
                              <Edit size={14} className="mr-1" />
                              Duzenle
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
              <span className="text-xs text-muted-foreground">
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
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Edit size={20} className="text-primary" />
              Hesap Bilgilerini Düzenle
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {/* Email (read-only) */}
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">EMAIL</Label>
              <Input
                value={editingAccount?.email || ''}
                disabled
                className="cyber-input font-mono opacity-50"
              />
            </div>

            {/* First Name */}
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">FIRST NAME *</Label>
              <Input
                value={editFirstName}
                onChange={(e) => setEditFirstName(e.target.value.toUpperCase())}
                className="cyber-input"
                placeholder="JOHN"
              />
            </div>

            {/* Middle Name */}
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">MIDDLE NAME</Label>
              <Input
                value={editMiddleName}
                onChange={(e) => setEditMiddleName(e.target.value.toUpperCase())}
                className="cyber-input"
                placeholder="WILLIAM"
              />
            </div>

            {/* Last Name */}
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">LAST NAME *</Label>
              <Input
                value={editLastName}
                onChange={(e) => setEditLastName(e.target.value.toUpperCase())}
                className="cyber-input"
                placeholder="DOE"
              />
            </div>

            {/* DOB */}
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs flex items-center gap-2">
                <Calendar size={14} />
                DOĞUM TARİHİ (AY/GÜN/YIL) *
              </Label>
              <div className="grid grid-cols-3 gap-2">
                <Select value={editDobMonth} onValueChange={setEditDobMonth}>
                  <SelectTrigger className="cyber-input">
                    <SelectValue placeholder="Ay" />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map((month) => (
                      <SelectItem key={month.value} value={month.value}>
                        {month.value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={editDobDay} onValueChange={setEditDobDay}>
                  <SelectTrigger className="cyber-input">
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

                <Select value={editDobYear} onValueChange={setEditDobYear}>
                  <SelectTrigger className="cyber-input">
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

            {/* Status */}
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">DURUM</Label>
              <Select value={editStatus} onValueChange={(value) => setEditStatus(value as AccountStatus)}>
                <SelectTrigger className="cyber-input">
                  <SelectValue placeholder="Durum seçin" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(statusConfig).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      <span className={config.color}>{config.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleSaveEdit}
              disabled={isSubmitting}
              className="w-full"
            >
              {isSubmitting ? 'Kaydediliyor...' : 'Kaydet'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}