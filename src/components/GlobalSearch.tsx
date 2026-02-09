import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  LayoutDashboard,
  Mail,
  CheckCircle,
  Brain,
  FileSearch,
  Settings,
  Users,
  Shield,
  Search,
  User,
} from 'lucide-react';

interface SearchResult {
  type: 'page' | 'account' | 'email';
  label: string;
  description?: string;
  path: string;
  icon: typeof Search;
}

const PAGES: SearchResult[] = [
  { type: 'page', label: 'Genel Bakis', path: '/dashboard/overview', icon: LayoutDashboard },
  { type: 'page', label: 'Postalar', path: '/dashboard', icon: Mail },
  { type: 'page', label: 'BGC Complete', path: '/dashboard/bgc-complete', icon: CheckCircle },
  { type: 'page', label: 'Istihbarat', path: '/dashboard/intelligence', icon: Brain },
  { type: 'page', label: 'Background', path: '/dashboard/background', icon: FileSearch },
  { type: 'page', label: 'Email Yonetimi', path: '/dashboard/emails', icon: Mail },
  { type: 'page', label: 'Kullanicilar', path: '/dashboard/users', icon: Users },
  { type: 'page', label: 'Roller', path: '/dashboard/roles', icon: Shield },
  { type: 'page', label: 'Ayarlar', path: '/dashboard/settings', icon: Settings },
];

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [accountResults, setAccountResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Search accounts when query changes
  useEffect(() => {
    if (!query || query.length < 2) {
      setAccountResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        // Search in bgc_scan_status for BGC accounts
        const { data: bgcData } = await supabase
          .from('bgc_scan_status')
          .select('account_email')
          .ilike('account_email', `%${query}%`)
          .limit(5);

        // Search in email_accounts for background accounts
        const { data: emailData } = await supabase
          .from('email_accounts')
          .select('email, first_name, last_name')
          .or(`email.ilike.%${query}%,first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
          .limit(5);

        const results: SearchResult[] = [];
        const seen = new Set<string>();

        if (bgcData) {
          for (const row of bgcData) {
            if (!seen.has(row.account_email)) {
              seen.add(row.account_email);
              results.push({
                type: 'account',
                label: row.account_email.split('@')[0],
                description: row.account_email,
                path: `/dashboard/account/${encodeURIComponent(row.account_email)}`,
                icon: User,
              });
            }
          }
        }

        if (emailData) {
          for (const row of emailData) {
            if (!seen.has(row.email)) {
              seen.add(row.email);
              const name = [row.first_name, row.last_name].filter(Boolean).join(' ');
              results.push({
                type: 'email',
                label: name || row.email.split('@')[0],
                description: row.email,
                path: `/dashboard/account/${encodeURIComponent(row.email)}`,
                icon: Mail,
              });
            }
          }
        }

        setAccountResults(results);
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (path: string) => {
    onOpenChange(false);
    setQuery('');
    navigate(path);
  };

  // Filter pages by query
  const filteredPages = query
    ? PAGES.filter(p => p.label.toLowerCase().includes(query.toLowerCase()))
    : PAGES;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Sayfa, hesap veya email ara..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          {searching ? 'Araniyor...' : 'Sonuc bulunamadi.'}
        </CommandEmpty>

        {filteredPages.length > 0 && (
          <CommandGroup heading="Sayfalar">
            {filteredPages.map((page) => (
              <CommandItem
                key={page.path}
                onSelect={() => handleSelect(page.path)}
                className="gap-2"
              >
                <page.icon className="h-4 w-4 text-muted-foreground" />
                {page.label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {accountResults.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Hesaplar">
              {accountResults.map((result) => (
                <CommandItem
                  key={result.path}
                  onSelect={() => handleSelect(result.path)}
                  className="gap-2"
                >
                  <result.icon className="h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span>{result.label}</span>
                    {result.description && (
                      <span className="text-xs text-muted-foreground font-mono">{result.description}</span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
