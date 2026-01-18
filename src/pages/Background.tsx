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
import { useToast } from '@/hooks/use-toast';
import { RefreshCw, Shield, FileSearch, Search, Mail, Calendar, X, User, Copy } from 'lucide-react';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

interface EmailAccount {
  id: string;
  email: string;
  date_of_birth: string;
  created_at: string;
  created_by: string | null;
}

export default function BackgroundPage() {
  const { isAdmin, profile } = useAuth();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Check permissions - same as email management
  const canManageEmails = isAdmin || profile?.permissions?.can_create_email || profile?.permissions?.can_change_password;

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

  const handleBgcQuery = (account: EmailAccount) => {
    toast({
      title: 'Bilgi',
      description: 'Bu özellik yakında eklenecek',
    });
  };

  const formatDateOfBirth = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return format(date, 'MM/dd/yyyy', { locale: tr });
    } catch {
      return dateString;
    }
  };

  // Extract name parts from email (e.g., john.middle.doe@example.com -> { first: "John", middle: "Middle", last: "Doe" })
  const extractNamePartsFromEmail = (email: string) => {
    const localPart = email.split('@')[0];
    // Replace dots, underscores with spaces and remove numbers
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
      // First part is first name, last part is last name, everything in between is middle name
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

  // Filter accounts based on search query
  const filteredAccounts = useMemo(() => {
    if (!searchQuery.trim()) return accounts;
    
    const query = searchQuery.toLowerCase().trim();
    return accounts.filter((account) => {
      const email = account.email.toLowerCase();
      const dob = formatDateOfBirth(account.date_of_birth).toLowerCase();
      return email.includes(query) || dob.includes(query);
    });
  }, [accounts, searchQuery]);

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

          <Button
            variant="ghost"
            size="icon"
            onClick={fetchAccounts}
            className="hover:bg-primary/10"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          </Button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Email veya doğum tarihine göre ara..."
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
                  const nameParts = extractNamePartsFromEmail(account.email);
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
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleBgcQuery(account)}
                          className="hover:bg-primary/10 hover:text-primary hover:border-primary font-mono text-xs"
                        >
                          <Search size={14} className="mr-1" />
                          BGC Sorgula
                        </Button>
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
    </DashboardLayout>
  );
}
