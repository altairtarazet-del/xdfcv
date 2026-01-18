import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { Plus, Key, Mail, RefreshCw, Shield, Eye, EyeOff, Server, ChevronLeft, ChevronRight, AlertCircle, Trash2, Calendar, Search, X } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { z } from 'zod';

// Name validation schema (uppercase, no Turkish chars, no spaces, letters only)
const nameSchema = z.string()
  .trim()
  .min(1, 'Bu alan zorunludur')
  .max(50, 'En fazla 50 karakter olabilir')
  .regex(/^[A-Z]+$/, 'Sadece büyük harf (A-Z) kullanın. Türkçe karakter, rakam ve boşluk kullanmayın.');

// Helper function to convert Turkish characters to English equivalents
const convertTurkishToEnglish = (str: string): string => {
  const turkishMap: Record<string, string> = {
    'ş': 's', 'Ş': 'S',
    'ğ': 'g', 'Ğ': 'G',
    'ü': 'u', 'Ü': 'U',
    'ö': 'o', 'Ö': 'O',
    'ç': 'c', 'Ç': 'C',
    'ı': 'i', 'İ': 'I',
  };
  return str.split('').map(char => turkishMap[char] || char).join('');
};

const EMAIL_DOMAIN = 'dasherhelp.com';
const DEFAULT_PASSWORD = 'Charles.2121';

interface Account {
  id: string;
  name?: string;
  address?: string;
}

interface PaginationView {
  first?: string;
  last?: string;
  next?: string;
  previous?: string;
}

export default function EmailManagementPage() {
  const { isAdmin, profile } = useAuth();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalAccounts, setTotalAccounts] = useState(0);
  const [paginationView, setPaginationView] = useState<PaginationView | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Form states
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [firstNameError, setFirstNameError] = useState<string | null>(null);
  const [middleNameError, setMiddleNameError] = useState<string | null>(null);
  const [lastNameError, setLastNameError] = useState<string | null>(null);
  
  // DOB states
  const [dobDay, setDobDay] = useState('');
  const [dobMonth, setDobMonth] = useState('');
  const [dobYear, setDobYear] = useState('');

  // Auto-generate username from first + last name
  const generatedUsername = (firstName && lastName) 
    ? (firstName + lastName).toLowerCase() 
    : '';

  // Check permissions
  const canCreateEmail = isAdmin || profile?.permissions?.can_create_email;
  const canChangePassword = isAdmin || profile?.permissions?.can_change_password;
  const canDeleteAccount = isAdmin || profile?.permissions?.can_delete_account;
  const canDeleteEmails = isAdmin || profile?.permissions?.can_delete_emails;

  const [apiError, setApiError] = useState<string | null>(null);

  // Filter accounts based on search query
  const filteredAccounts = useMemo(() => {
    if (!searchQuery.trim()) return accounts;
    
    const query = searchQuery.toLowerCase().trim();
    return accounts.filter((account) => {
      const address = (account.address || '').toLowerCase();
      const name = (account.name || '').toLowerCase();
      return address.includes(query) || name.includes(query);
    });
  }, [accounts, searchQuery]);

  const fetchAccounts = useCallback(async (page?: number, retryCount = 0) => {
    setIsLoading(true);
    setApiError(null);
    try {
      const { data, error } = await supabase.functions.invoke('smtp-api', {
        body: { action: 'getAccounts', page: page || currentPage },
      });

      if (error) throw error;
      
      // Check for API error in response
      if (data?.error) {
        throw new Error(data.error);
      }
      
      const accountList = Array.isArray(data?.accounts) ? data.accounts : [];
      setAccounts(accountList);
      setTotalAccounts(data?.totalItems || accountList.length);
      setPaginationView(data?.view || null);
    } catch (error: any) {
      console.error('Error fetching accounts:', error);
      const errorMessage = error?.message || 'Bilinmeyen hata';
      
      // Check if it's a server error (500, 502, 503, 504)
      const isServerError = errorMessage.includes('500') || errorMessage.includes('502') || 
                           errorMessage.includes('503') || errorMessage.includes('504');
      
      // Auto-retry once for server errors
      if (isServerError && retryCount < 1) {
        console.log('Server error, retrying in 2 seconds...');
        setTimeout(() => fetchAccounts(page, retryCount + 1), 2000);
        return;
      }
      
      setApiError(isServerError 
        ? 'SMTP.dev servisi geçici olarak kullanılamıyor. Lütfen birkaç dakika bekleyip tekrar deneyin.'
        : 'Hesaplar yüklenirken bir hata oluştu');
      
      toast({
        variant: 'destructive',
        title: 'Bağlantı Hatası',
        description: isServerError 
          ? 'Mail servisi geçici olarak yanıt vermiyor. Lütfen tekrar deneyin.'
          : 'Hesaplar yüklenirken bir hata oluştu',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast, currentPage]);

  useEffect(() => {
    fetchAccounts(currentPage);
  }, [currentPage]);

  const handlePrevPage = () => {
    if (paginationView?.previous && currentPage > 1) {
      setCurrentPage(prev => prev - 1);
    }
  };

  const handleNextPage = () => {
    if (paginationView?.next) {
      setCurrentPage(prev => prev + 1);
    }
  };

  const totalPages = Math.ceil(totalAccounts / 30);

  const validateName = (name: string, setError: (error: string | null) => void, isRequired: boolean = true): boolean => {
    if (!name && !isRequired) {
      setError(null);
      return true;
    }
    try {
      nameSchema.parse(name);
      setError(null);
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        setError(error.errors[0].message);
      }
      return false;
    }
  };

  const handleNameChange = (
    value: string, 
    setter: (value: string) => void, 
    setError: (error: string | null) => void,
    isRequired: boolean = true
  ) => {
    // Convert Turkish chars to English and make uppercase, remove spaces
    const cleanValue = convertTurkishToEnglish(value).toUpperCase().replace(/\s/g, '');
    setter(cleanValue);
    if (cleanValue || isRequired) {
      validateName(cleanValue, setError, isRequired);
    } else {
      setError(null);
    }
  };

  const handleCreateEmail = async () => {
    // Validate names
    const isFirstNameValid = validateName(firstName, setFirstNameError, true);
    const isMiddleNameValid = validateName(middleName, setMiddleNameError, false);
    const isLastNameValid = validateName(lastName, setLastNameError, true);
    
    if (!isFirstNameValid || !isMiddleNameValid || !isLastNameValid) {
      return;
    }

    // Validate DOB
    if (!dobDay || !dobMonth || !dobYear) {
      toast({
        variant: 'destructive',
        title: 'Hata',
        description: 'Doğum tarihi zorunludur',
      });
      return;
    }

    const fullEmail = `${generatedUsername}@${EMAIL_DOMAIN}`;
    const dateOfBirth = `${dobYear}-${dobMonth.padStart(2, '0')}-${dobDay.padStart(2, '0')}`;
    
    setIsSubmitting(true);
    try {
      // First, create the email account via SMTP API
      const { data, error } = await supabase.functions.invoke('smtp-api', {
        body: {
          action: 'createAccount',
          email: fullEmail,
          password: DEFAULT_PASSWORD,
        },
      });

      if (error) throw error;

      // Then, save to email_accounts table with DOB
      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;

      const { error: dbError } = await supabase
        .from('email_accounts')
        .insert({
          email: fullEmail,
          date_of_birth: dateOfBirth,
          created_by: userId,
          first_name: firstName,
          middle_name: middleName || null,
          last_name: lastName,
        });

      if (dbError) {
        console.error('Error saving to email_accounts:', dbError);
        // Don't throw - email was still created successfully
        toast({
          variant: 'destructive',
          title: 'Uyarı',
          description: 'Email oluşturuldu ancak veritabanına kaydedilemedi',
        });
      } else {
        toast({
          title: 'Başarılı',
          description: `${fullEmail} hesabı oluşturuldu`,
        });
      }

      setIsCreateDialogOpen(false);
      setFirstName('');
      setMiddleName('');
      setLastName('');
      setFirstNameError(null);
      setMiddleNameError(null);
      setLastNameError(null);
      setDobDay('');
      setDobMonth('');
      setDobYear('');
      fetchAccounts(currentPage);
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

  const handleDeleteAccount = async (account: Account) => {
    if (!confirm(`"${account.address || account.name || account.id}" hesabını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`)) {
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('smtp-api', {
        body: {
          action: 'deleteAccount',
          accountId: account.id,
        },
      });

      if (error) throw error;

      // Also delete from email_accounts table
      const emailAddress = account.address || account.name;
      if (emailAddress) {
        const { error: dbError } = await supabase
          .from('email_accounts')
          .delete()
          .eq('email', emailAddress);
        
        if (dbError) {
          console.error('Error deleting from email_accounts:', dbError);
        }
      }

      toast({
        title: 'Başarılı',
        description: 'Hesap silindi',
      });

      fetchAccounts(currentPage);
    } catch (error: any) {
      console.error('Error deleting account:', error);
      toast({
        variant: 'destructive',
        title: 'Hata',
        description: error.message || 'Hesap silinirken bir hata oluştu',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteAllEmails = async (account: Account) => {
    if (!confirm(`"${account.address || account.name || account.id}" hesabındaki TÜM mailleri (inbox + çöp kutusu) silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`)) {
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('smtp-api', {
        body: {
          action: 'deleteAllMailboxMessages',
          accountId: account.id,
        },
      });

      if (error) throw error;

      toast({
        title: 'Başarılı',
        description: `${data.deletedCount || 0} mail silindi`,
      });
    } catch (error: any) {
      console.error('Error deleting emails:', error);
      toast({
        variant: 'destructive',
        title: 'Hata',
        description: error.message || 'Mailler silinirken bir hata oluştu',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Access control
  if (!canCreateEmail && !canChangePassword && !canDeleteAccount && !canDeleteEmails) {
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
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-mono font-bold text-foreground cyber-glow-text">
              Email Yönetimi
            </h1>
            <p className="text-muted-foreground font-mono text-sm">
              Email hesaplarını oluşturun ve yönetin
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Search Bar */}
            <div className="relative flex-1 lg:w-64">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Email veya isim ara..."
                className="cyber-input font-mono pl-10 pr-10 text-sm"
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

            <Button
              variant="ghost"
              size="icon"
              onClick={() => fetchAccounts(currentPage)}
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
                    {/* First Name */}
                    <div className="space-y-2">
                      <Label className="text-muted-foreground font-mono text-xs">
                        AD (First Name) *
                      </Label>
                      <Input
                        type="text"
                        value={firstName}
                        onChange={(e) => handleNameChange(e.target.value, setFirstName, setFirstNameError, true)}
                        className={`cyber-input font-mono ${firstNameError ? 'border-destructive' : ''}`}
                        placeholder="AHMET"
                      />
                      {firstNameError && (
                        <div className="flex items-center gap-2 text-destructive text-xs font-mono">
                          <AlertCircle size={12} />
                          {firstNameError}
                        </div>
                      )}
                    </div>

                    {/* Middle Name */}
                    <div className="space-y-2">
                      <Label className="text-muted-foreground font-mono text-xs">
                        İKİNCİ AD (Middle Name)
                      </Label>
                      <Input
                        type="text"
                        value={middleName}
                        onChange={(e) => handleNameChange(e.target.value, setMiddleName, setMiddleNameError, false)}
                        className={`cyber-input font-mono ${middleNameError ? 'border-destructive' : ''}`}
                        placeholder="ALI (opsiyonel)"
                      />
                      {middleNameError && (
                        <div className="flex items-center gap-2 text-destructive text-xs font-mono">
                          <AlertCircle size={12} />
                          {middleNameError}
                        </div>
                      )}
                    </div>

                    {/* Last Name */}
                    <div className="space-y-2">
                      <Label className="text-muted-foreground font-mono text-xs">
                        SOYAD (Last Name) *
                      </Label>
                      <Input
                        type="text"
                        value={lastName}
                        onChange={(e) => handleNameChange(e.target.value, setLastName, setLastNameError, true)}
                        className={`cyber-input font-mono ${lastNameError ? 'border-destructive' : ''}`}
                        placeholder="YILMAZ"
                      />
                      {lastNameError && (
                        <div className="flex items-center gap-2 text-destructive text-xs font-mono">
                          <AlertCircle size={12} />
                          {lastNameError}
                        </div>
                      )}
                    </div>

                    <div className="p-3 bg-muted/30 rounded-lg space-y-1">
                      <p className="text-xs text-muted-foreground font-mono flex items-center gap-2">
                        <AlertCircle size={12} className="text-yellow-500" />
                        <span className="text-yellow-500 font-medium">Önemli:</span>
                      </p>
                      <ul className="text-xs text-muted-foreground font-mono list-disc list-inside space-y-1 ml-4">
                        <li>İsimler otomatik BÜYÜK HARFE çevrilir</li>
                        <li>Türkçe karakterler otomatik çevrilir (ş→s, ğ→g, ü→u, ö→o, ç→c, ı→i)</li>
                        <li>Email: ad + soyad (küçük harflerle)</li>
                      </ul>
                      <p className="text-xs font-mono mt-2">
                        <span className="text-muted-foreground">Örnek: </span>
                        <span className="text-foreground">AHMET YILMAZ</span>
                        <span className="text-muted-foreground"> → </span>
                        <span className="text-primary">ahmetyilmaz@{EMAIL_DOMAIN}</span>
                      </p>
                    </div>
                    
                    {/* DOB Fields */}
                    <div className="space-y-2">
                      <Label className="text-muted-foreground font-mono text-xs flex items-center gap-2">
                        <Calendar size={12} />
                        DOĞUM TARİHİ
                      </Label>
                      <div className="grid grid-cols-3 gap-2">
                        <Select value={dobMonth} onValueChange={setDobMonth}>
                          <SelectTrigger className="cyber-input font-mono">
                            <SelectValue placeholder="Ay" />
                          </SelectTrigger>
                          <SelectContent className="bg-background border-border z-50">
                            {[
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
                            ].map((month) => (
                              <SelectItem key={month.value} value={month.value} className="font-mono">
                                {month.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={dobDay} onValueChange={setDobDay}>
                          <SelectTrigger className="cyber-input font-mono">
                            <SelectValue placeholder="Gün" />
                          </SelectTrigger>
                          <SelectContent className="bg-background border-border z-50">
                            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                              <SelectItem key={day} value={String(day)} className="font-mono">
                                {String(day).padStart(2, '0')}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={dobYear} onValueChange={setDobYear}>
                          <SelectTrigger className="cyber-input font-mono">
                            <SelectValue placeholder="Yıl" />
                          </SelectTrigger>
                          <SelectContent className="bg-background border-border z-50 max-h-[200px]">
                            {Array.from({ length: 61 }, (_, i) => 2010 - i).map((year) => (
                              <SelectItem key={year} value={String(year)} className="font-mono">
                                {year}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {firstName && lastName && !firstNameError && !lastNameError && !middleNameError && dobDay && dobMonth && dobYear && (
                      <div className="p-3 bg-primary/10 rounded-lg border border-primary/30">
                        <p className="text-xs text-muted-foreground font-mono">İsim:</p>
                        <p className="font-mono text-foreground font-medium">
                          {firstName} {middleName ? middleName + ' ' : ''}{lastName}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono mt-2">Oluşturulacak email:</p>
                        <p className="font-mono text-primary font-medium">{generatedUsername}@{EMAIL_DOMAIN}</p>
                        <p className="text-xs text-muted-foreground font-mono mt-1">
                          DOB: {dobMonth.padStart(2, '0')}/{dobDay.padStart(2, '0')}/{dobYear}
                        </p>
                      </div>
                    )}
                    
                    <Button
                      onClick={handleCreateEmail}
                      disabled={isSubmitting || !firstName || !lastName || !!firstNameError || !!lastNameError || !!middleNameError || !dobDay || !dobMonth || !dobYear}
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
              ) : apiError ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8">
                    <AlertCircle size={32} className="mx-auto text-destructive mb-2" />
                    <p className="text-destructive font-mono text-sm mb-2">{apiError}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchAccounts(currentPage)}
                      className="font-mono"
                    >
                      <RefreshCw size={14} className="mr-2" />
                      Tekrar Dene
                    </Button>
                  </TableCell>
                </TableRow>
              ) : filteredAccounts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8">
                    <Mail size={32} className="mx-auto text-muted-foreground mb-2" />
                    <span className="text-muted-foreground font-mono">
                      {searchQuery ? 'Arama sonucu bulunamadı' : 'Henüz email hesabı yok'}
                    </span>
                  </TableCell>
                </TableRow>
              ) : (
                filteredAccounts.map((account) => (
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
                      <div className="flex items-center gap-1 flex-wrap">
                        {canChangePassword && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openPasswordDialog(account)}
                            disabled={isSubmitting}
                            className="hover:bg-primary/10 hover:text-primary font-mono text-xs"
                          >
                            <Key size={14} className="mr-1" />
                            Şifre
                          </Button>
                        )}
                        {canDeleteEmails && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteAllEmails(account)}
                            disabled={isSubmitting}
                            className="hover:bg-orange-500/10 hover:text-orange-500 font-mono text-xs"
                          >
                            <Trash2 size={14} className="mr-1" />
                            Mailler
                          </Button>
                        )}
                        {canDeleteAccount && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteAccount(account)}
                            disabled={isSubmitting}
                            className="hover:bg-destructive/10 hover:text-destructive font-mono text-xs"
                          >
                            <Trash2 size={14} className="mr-1" />
                            Hesap
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Pagination Controls */}
          {totalAccounts > 0 && (
            <div className="flex items-center justify-between p-4 border-t border-border/30">
              <span className="font-mono text-xs text-muted-foreground">
                {searchQuery 
                  ? `${filteredAccounts.length} / ${totalAccounts} hesap gösteriliyor`
                  : `Toplam: ${totalAccounts} hesap`
                }
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handlePrevPage}
                  disabled={currentPage <= 1 || isLoading}
                  className="hover:bg-primary/10 font-mono text-xs"
                >
                  <ChevronLeft size={16} className="mr-1" />
                  Önceki
                </Button>
                <span className="font-mono text-sm text-foreground px-2">
                  {currentPage} / {totalPages || 1}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleNextPage}
                  disabled={!paginationView?.next || isLoading}
                  className="hover:bg-primary/10 font-mono text-xs"
                >
                  Sonraki
                  <ChevronRight size={16} className="ml-1" />
                </Button>
              </div>
            </div>
          )}
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
