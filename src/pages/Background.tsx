import { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { RefreshCw, Shield, FileSearch, Search, Mail, Calendar } from 'lucide-react';
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
      return format(date, 'dd/MM/yyyy', { locale: tr });
    } catch {
      return dateString;
    }
  };

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

        {/* Accounts Table */}
        <div className="cyber-card rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border/50">
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
                  <TableCell colSpan={3} className="text-center py-8">
                    <span className="text-muted-foreground font-mono animate-pulse">
                      Yükleniyor...
                    </span>
                  </TableCell>
                </TableRow>
              ) : accounts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8">
                    <FileSearch size={32} className="mx-auto text-muted-foreground mb-2" />
                    <span className="text-muted-foreground font-mono">
                      Henüz kayıtlı email hesabı yok
                    </span>
                    <p className="text-muted-foreground font-mono text-xs mt-1">
                      Email oluşturma sayfasından yeni hesap ekleyebilirsiniz
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                accounts.map((account) => (
                  <TableRow key={account.id} className="border-b border-border/30">
                    <TableCell className="font-mono text-sm">
                      <span className="px-2 py-1 bg-primary/20 text-primary rounded">
                        {account.email}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-foreground">
                      {formatDateOfBirth(account.date_of_birth)}
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
                ))
              )}
            </TableBody>
          </Table>

          {/* Total Count */}
          {accounts.length > 0 && (
            <div className="flex items-center justify-between p-4 border-t border-border/30">
              <span className="font-mono text-xs text-muted-foreground">
                Toplam: {accounts.length} hesap
              </span>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
