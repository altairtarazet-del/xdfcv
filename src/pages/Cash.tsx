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
import { 
  Wallet, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Shield, 
  RefreshCw,
  Search,
  X,
  Plus,
  Undo2,
  Settings,
  FileSearch,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type AccountStatus = 'acildi' | 'background' | 'aktif' | 'kapandi' | 'suspend';

interface EmailAccount {
  id: string;
  email: string;
  date_of_birth: string;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  status: AccountStatus;
}

interface CashTransaction {
  id: string;
  email_account_id: string;
  transaction_type: string;
  payment_stage: string;
  amount: number;
  description: string | null;
  created_at: string;
}

interface CashSettings {
  id: string;
  first_payment_default: number;
  second_payment_default: number;
}

interface AccountWithPayments extends EmailAccount {
  first_payment: number | null;
  second_payment: number | null;
  first_refund: number | null;
  second_refund: number | null;
  total_paid: number;
  total_refunded: number;
  status_display: 'kasada' | 'iade_edildi' | 'beklemede';
}

const statusConfig: Record<AccountStatus, { label: string; color: string; bgColor: string }> = {
  acildi: { label: 'Açıldı', color: 'text-green-400', bgColor: 'bg-green-500/20' },
  background: { label: 'Background', color: 'text-blue-400', bgColor: 'bg-blue-500/20' },
  aktif: { label: 'Aktif', color: 'text-cyan-400', bgColor: 'bg-cyan-500/20' },
  kapandi: { label: 'Kapandı', color: 'text-red-400', bgColor: 'bg-red-500/20' },
  suspend: { label: 'Suspend', color: 'text-orange-400', bgColor: 'bg-orange-500/20' },
};

export default function CashPage() {
  const { isAdmin, profile } = useAuth();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [settings, setSettings] = useState<CashSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<AccountStatus | 'all'>('all');
  
  // Payment dialog
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<EmailAccount | null>(null);
  const [paymentStage, setPaymentStage] = useState<'first_payment' | 'second_payment'>('first_payment');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDescription, setPaymentDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Refund dialog
  const [isRefundDialogOpen, setIsRefundDialogOpen] = useState(false);
  const [refundStage, setRefundStage] = useState<'first_payment' | 'second_payment'>('first_payment');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundDescription, setRefundDescription] = useState('');
  
  // Settings dialog
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const [settingsFirstPayment, setSettingsFirstPayment] = useState('');
  const [settingsSecondPayment, setSettingsSecondPayment] = useState('');

  const canManageEmails = isAdmin || profile?.permissions?.can_create_email;

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [accountsRes, transactionsRes, settingsRes] = await Promise.all([
        supabase.from('email_accounts').select('*').order('created_at', { ascending: false }),
        supabase.from('cash_transactions').select('*'),
        supabase.from('cash_settings').select('*').limit(1).maybeSingle(),
      ]);

      if (accountsRes.error) throw accountsRes.error;
      if (transactionsRes.error) throw transactionsRes.error;

      setAccounts(accountsRes.data || []);
      setTransactions(transactionsRes.data || []);
      setSettings(settingsRes.data || { id: '', first_payment_default: 400, second_payment_default: 400 });
    } catch (error: any) {
      console.error('Error fetching data:', error);
      toast({
        variant: 'destructive',
        title: 'Hata',
        description: 'Veriler yüklenirken bir hata oluştu',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Calculate accounts with payment info
  const accountsWithPayments: AccountWithPayments[] = useMemo(() => {
    return accounts.map(account => {
      const accountTransactions = transactions.filter(t => t.email_account_id === account.id);
      
      const firstPayment = accountTransactions.find(t => t.transaction_type === 'payment' && t.payment_stage === 'first_payment');
      const secondPayment = accountTransactions.find(t => t.transaction_type === 'payment' && t.payment_stage === 'second_payment');
      const firstRefund = accountTransactions.find(t => t.transaction_type === 'refund' && t.payment_stage === 'first_payment');
      const secondRefund = accountTransactions.find(t => t.transaction_type === 'refund' && t.payment_stage === 'second_payment');
      
      const totalPaid = (firstPayment?.amount || 0) + (secondPayment?.amount || 0);
      const totalRefunded = (firstRefund?.amount || 0) + (secondRefund?.amount || 0);
      
      // Determine status display
      let statusDisplay: 'kasada' | 'iade_edildi' | 'beklemede' = 'beklemede';
      if (totalRefunded > 0 && totalRefunded >= totalPaid) {
        statusDisplay = 'iade_edildi';
      } else if (account.status === 'aktif' || account.status === 'acildi') {
        statusDisplay = 'kasada';
      } else if (account.status === 'kapandi') {
        statusDisplay = totalRefunded > 0 ? 'iade_edildi' : 'beklemede';
      }
      
      return {
        ...account,
        first_payment: firstPayment?.amount || null,
        second_payment: secondPayment?.amount || null,
        first_refund: firstRefund?.amount || null,
        second_refund: secondRefund?.amount || null,
        total_paid: totalPaid,
        total_refunded: totalRefunded,
        status_display: statusDisplay,
      };
    });
  }, [accounts, transactions]);

  // Filter accounts
  const filteredAccounts = useMemo(() => {
    let result = accountsWithPayments;
    
    if (filterStatus !== 'all') {
      result = result.filter(a => a.status === filterStatus);
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(a => 
        a.email.toLowerCase().includes(query) ||
        (a.first_name?.toLowerCase() || '').includes(query) ||
        (a.last_name?.toLowerCase() || '').includes(query)
      );
    }
    
    return result;
  }, [accountsWithPayments, filterStatus, searchQuery]);

  // Calculate totals
  const totals = useMemo(() => {
    const totalIn = transactions
      .filter(t => t.transaction_type === 'payment')
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const totalOut = transactions
      .filter(t => t.transaction_type === 'refund')
      .reduce((sum, t) => sum + Number(t.amount), 0);
    return {
      totalIn,
      totalOut,
      net: totalIn - totalOut,
    };
  }, [transactions]);

  // Open payment dialog
  const openPaymentDialog = (account: EmailAccount, stage: 'first_payment' | 'second_payment') => {
    setSelectedAccount(account);
    setPaymentStage(stage);
    setPaymentAmount(stage === 'first_payment' 
      ? String(settings?.first_payment_default || 400)
      : String(settings?.second_payment_default || 400)
    );
    setPaymentDescription('');
    setIsPaymentDialogOpen(true);
  };

  // Open refund dialog
  const openRefundDialog = (account: EmailAccount, stage: 'first_payment' | 'second_payment', amount: number) => {
    setSelectedAccount(account);
    setRefundStage(stage);
    setRefundAmount(String(amount));
    setRefundDescription('');
    setIsRefundDialogOpen(true);
  };

  // Handle payment
  const handleAddPayment = async () => {
    if (!selectedAccount || !paymentAmount) return;
    
    setIsSubmitting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      
      const { error } = await supabase.from('cash_transactions').insert({
        email_account_id: selectedAccount.id,
        transaction_type: 'payment',
        payment_stage: paymentStage,
        amount: parseFloat(paymentAmount),
        description: paymentDescription || null,
        created_by: session?.session?.user?.id,
      });
      
      if (error) throw error;
      
      toast({
        title: 'Başarılı',
        description: 'Ödeme kaydedildi',
      });
      
      setIsPaymentDialogOpen(false);
      fetchData();
    } catch (error: any) {
      console.error('Error adding payment:', error);
      toast({
        variant: 'destructive',
        title: 'Hata',
        description: 'Ödeme eklenirken bir hata oluştu',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle refund
  const handleAddRefund = async () => {
    if (!selectedAccount || !refundAmount) return;
    
    setIsSubmitting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      
      const { error } = await supabase.from('cash_transactions').insert({
        email_account_id: selectedAccount.id,
        transaction_type: 'refund',
        payment_stage: refundStage,
        amount: parseFloat(refundAmount),
        description: refundDescription || null,
        created_by: session?.session?.user?.id,
      });
      
      if (error) throw error;
      
      toast({
        title: 'Başarılı',
        description: 'İade kaydedildi',
      });
      
      setIsRefundDialogOpen(false);
      fetchData();
    } catch (error: any) {
      console.error('Error adding refund:', error);
      toast({
        variant: 'destructive',
        title: 'Hata',
        description: 'İade eklenirken bir hata oluştu',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle settings update
  const handleUpdateSettings = async () => {
    if (!settings) return;
    
    setIsSubmitting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      
      const { error } = await supabase.from('cash_settings').update({
        first_payment_default: parseFloat(settingsFirstPayment),
        second_payment_default: parseFloat(settingsSecondPayment),
        updated_by: session?.session?.user?.id,
        updated_at: new Date().toISOString(),
      }).eq('id', settings.id);
      
      if (error) throw error;
      
      toast({
        title: 'Başarılı',
        description: 'Ayarlar güncellendi',
      });
      
      setIsSettingsDialogOpen(false);
      fetchData();
    } catch (error: any) {
      console.error('Error updating settings:', error);
      toast({
        variant: 'destructive',
        title: 'Hata',
        description: 'Ayarlar güncellenirken bir hata oluştu',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open settings dialog
  const openSettingsDialog = () => {
    setSettingsFirstPayment(String(settings?.first_payment_default || 400));
    setSettingsSecondPayment(String(settings?.second_payment_default || 400));
    setIsSettingsDialogOpen(true);
  };

  // Access control
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
              Kasa Yönetimi
            </h1>
            <p className="text-muted-foreground font-mono text-sm">
              Ödemeler ve iadeleri takip edin
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={openSettingsDialog}
              className="hover:bg-primary/10 font-mono text-xs"
            >
              <Settings size={14} className="mr-1" />
              Ayarlar
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={fetchData}
              className="hover:bg-primary/10"
            >
              <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="cyber-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-mono text-muted-foreground">Toplam Giren</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-green-400">
                ${totals.totalIn.toLocaleString()}
              </div>
            </CardContent>
          </Card>
          
          <Card className="cyber-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-mono text-muted-foreground">Toplam Çıkan (İade)</CardTitle>
              <TrendingDown className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-red-400">
                ${totals.totalOut.toLocaleString()}
              </div>
            </CardContent>
          </Card>
          
          <Card className="cyber-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-mono text-muted-foreground">Net Kasa</CardTitle>
              <DollarSign className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold font-mono ${totals.net >= 0 ? 'text-primary' : 'text-red-400'}`}>
                ${totals.net.toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Email veya isim ara..."
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
          
          <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as AccountStatus | 'all')}>
            <SelectTrigger className="w-full sm:w-48 cyber-input font-mono">
              <SelectValue placeholder="Tüm Durumlar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="font-mono">Tüm Durumlar</SelectItem>
              {Object.entries(statusConfig).map(([key, config]) => (
                <SelectItem key={key} value={key} className="font-mono">
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
                <TableHead className="font-mono text-muted-foreground">MÜŞTERİ</TableHead>
                <TableHead className="font-mono text-muted-foreground">DURUM</TableHead>
                <TableHead className="font-mono text-muted-foreground text-right">1. ÖDEME</TableHead>
                <TableHead className="font-mono text-muted-foreground text-right">2. ÖDEME</TableHead>
                <TableHead className="font-mono text-muted-foreground text-right">TOPLAM</TableHead>
                <TableHead className="font-mono text-muted-foreground">PARA DURUMU</TableHead>
                <TableHead className="font-mono text-muted-foreground">İŞLEMLER</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <span className="text-muted-foreground font-mono animate-pulse">
                      Yükleniyor...
                    </span>
                  </TableCell>
                </TableRow>
              ) : filteredAccounts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <FileSearch size={32} className="mx-auto text-muted-foreground mb-2" />
                    <span className="text-muted-foreground font-mono">
                      {searchQuery ? 'Arama sonucu bulunamadı' : 'Henüz hesap yok'}
                    </span>
                  </TableCell>
                </TableRow>
              ) : (
                filteredAccounts.map((account) => {
                  const config = statusConfig[account.status];
                  const hasFirstPayment = account.first_payment !== null;
                  const hasSecondPayment = account.second_payment !== null;
                  const hasFirstRefund = account.first_refund !== null;
                  const hasSecondRefund = account.second_refund !== null;
                  
                  return (
                    <TableRow key={account.id} className="border-b border-border/30">
                      <TableCell className="font-mono text-sm">
                        <div>
                          <div className="font-medium text-foreground">{account.email}</div>
                          <div className="text-xs text-muted-foreground">
                            {account.first_name} {account.last_name}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded text-xs font-medium font-mono ${config.bgColor} ${config.color}`}>
                          {config.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {hasFirstPayment ? (
                          <span className={hasFirstRefund ? 'line-through text-muted-foreground' : 'text-green-400'}>
                            ${account.first_payment}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {hasSecondPayment ? (
                          <span className={hasSecondRefund ? 'line-through text-muted-foreground' : 'text-green-400'}>
                            ${account.second_payment}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        <div className="space-y-1">
                          <div className="text-foreground">${account.total_paid}</div>
                          {account.total_refunded > 0 && (
                            <div className="text-xs text-red-400">-${account.total_refunded}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {account.status_display === 'kasada' && (
                          <span className="px-2 py-1 rounded text-xs font-medium font-mono bg-green-500/20 text-green-400">
                            Kasada
                          </span>
                        )}
                        {account.status_display === 'iade_edildi' && (
                          <span className="px-2 py-1 rounded text-xs font-medium font-mono bg-red-500/20 text-red-400">
                            İade Edildi
                          </span>
                        )}
                        {account.status_display === 'beklemede' && (
                          <span className="px-2 py-1 rounded text-xs font-medium font-mono bg-yellow-500/20 text-yellow-400">
                            Beklemede
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 flex-wrap">
                          {/* Payment buttons */}
                          {!hasFirstPayment && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openPaymentDialog(account, 'first_payment')}
                              className="hover:bg-green-500/10 hover:text-green-400 hover:border-green-500/50 font-mono text-xs"
                            >
                              <Plus size={12} className="mr-1" />
                              1. Ödeme
                            </Button>
                          )}
                          {hasFirstPayment && !hasSecondPayment && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openPaymentDialog(account, 'second_payment')}
                              className="hover:bg-green-500/10 hover:text-green-400 hover:border-green-500/50 font-mono text-xs"
                            >
                              <Plus size={12} className="mr-1" />
                              2. Ödeme
                            </Button>
                          )}
                          
                          {/* Refund buttons */}
                          {hasFirstPayment && !hasFirstRefund && (account.status === 'kapandi' || account.status === 'suspend') && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openRefundDialog(account, 'first_payment', account.first_payment!)}
                              className="hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/50 font-mono text-xs"
                            >
                              <Undo2 size={12} className="mr-1" />
                              1. İade
                            </Button>
                          )}
                          {hasSecondPayment && !hasSecondRefund && (account.status === 'kapandi' || account.status === 'suspend') && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openRefundDialog(account, 'second_payment', account.second_payment!)}
                              className="hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/50 font-mono text-xs"
                            >
                              <Undo2 size={12} className="mr-1" />
                              2. İade
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
                {searchQuery || filterStatus !== 'all'
                  ? `${filteredAccounts.length} / ${accounts.length} hesap gösteriliyor`
                  : `Toplam: ${accounts.length} hesap`
                }
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Payment Dialog */}
      <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
        <DialogContent className="cyber-card border-primary/30">
          <DialogHeader>
            <DialogTitle className="font-mono text-foreground flex items-center gap-2">
              <Plus size={20} className="text-green-500" />
              Ödeme Ekle
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground font-mono text-xs">MÜŞTERİ</Label>
              <Input
                value={selectedAccount?.email || ''}
                disabled
                className="cyber-input font-mono opacity-50"
              />
            </div>
            
            <div className="space-y-2">
              <Label className="text-muted-foreground font-mono text-xs">ÖDEME TİPİ</Label>
              <Input
                value={paymentStage === 'first_payment' ? '1. Ödeme (Ön Ödeme)' : '2. Ödeme (Hesap Açıldıktan Sonra)'}
                disabled
                className="cyber-input font-mono opacity-50"
              />
            </div>
            
            <div className="space-y-2">
              <Label className="text-muted-foreground font-mono text-xs">TUTAR ($)</Label>
              <Input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="cyber-input font-mono"
                placeholder="400"
              />
            </div>
            
            <div className="space-y-2">
              <Label className="text-muted-foreground font-mono text-xs">AÇIKLAMA (İsteğe Bağlı)</Label>
              <Input
                value={paymentDescription}
                onChange={(e) => setPaymentDescription(e.target.value)}
                className="cyber-input font-mono"
                placeholder="Not ekleyin..."
              />
            </div>
            
            <Button
              onClick={handleAddPayment}
              disabled={isSubmitting || !paymentAmount}
              className="w-full cyber-glow font-mono bg-green-600 hover:bg-green-700"
            >
              {isSubmitting ? 'Kaydediliyor...' : 'Ödemeyi Kaydet'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Refund Dialog */}
      <Dialog open={isRefundDialogOpen} onOpenChange={setIsRefundDialogOpen}>
        <DialogContent className="cyber-card border-primary/30">
          <DialogHeader>
            <DialogTitle className="font-mono text-foreground flex items-center gap-2">
              <Undo2 size={20} className="text-red-500" />
              İade Et
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground font-mono text-xs">MÜŞTERİ</Label>
              <Input
                value={selectedAccount?.email || ''}
                disabled
                className="cyber-input font-mono opacity-50"
              />
            </div>
            
            <div className="space-y-2">
              <Label className="text-muted-foreground font-mono text-xs">İADE TİPİ</Label>
              <Input
                value={refundStage === 'first_payment' ? '1. Ödeme İadesi' : '2. Ödeme İadesi'}
                disabled
                className="cyber-input font-mono opacity-50"
              />
            </div>
            
            <div className="space-y-2">
              <Label className="text-muted-foreground font-mono text-xs">TUTAR ($)</Label>
              <Input
                type="number"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                className="cyber-input font-mono"
              />
            </div>
            
            <div className="space-y-2">
              <Label className="text-muted-foreground font-mono text-xs">AÇIKLAMA (İsteğe Bağlı)</Label>
              <Input
                value={refundDescription}
                onChange={(e) => setRefundDescription(e.target.value)}
                className="cyber-input font-mono"
                placeholder="İade sebebi..."
              />
            </div>
            
            <Button
              onClick={handleAddRefund}
              disabled={isSubmitting || !refundAmount}
              className="w-full font-mono bg-red-600 hover:bg-red-700"
            >
              {isSubmitting ? 'Kaydediliyor...' : 'İadeyi Kaydet'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={isSettingsDialogOpen} onOpenChange={setIsSettingsDialogOpen}>
        <DialogContent className="cyber-card border-primary/30">
          <DialogHeader>
            <DialogTitle className="font-mono text-foreground flex items-center gap-2">
              <Settings size={20} className="text-primary" />
              Kasa Ayarları
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground font-mono text-xs">VARSAYILAN 1. ÖDEME TUTARI ($)</Label>
              <Input
                type="number"
                value={settingsFirstPayment}
                onChange={(e) => setSettingsFirstPayment(e.target.value)}
                className="cyber-input font-mono"
                placeholder="400"
              />
            </div>
            
            <div className="space-y-2">
              <Label className="text-muted-foreground font-mono text-xs">VARSAYILAN 2. ÖDEME TUTARI ($)</Label>
              <Input
                type="number"
                value={settingsSecondPayment}
                onChange={(e) => setSettingsSecondPayment(e.target.value)}
                className="cyber-input font-mono"
                placeholder="400"
              />
            </div>
            
            <Button
              onClick={handleUpdateSettings}
              disabled={isSubmitting}
              className="w-full cyber-glow font-mono"
            >
              {isSubmitting ? 'Kaydediliyor...' : 'Ayarları Kaydet'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
