import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

interface ShortcutHandlers {
  onSearch?: () => void;
  onScan?: () => void;
}

const TAB_ROUTES = [
  '/dashboard/overview',
  '/dashboard',
  '/dashboard/background',
  '/dashboard/bgc-complete',
  '/dashboard/intelligence',
  '/dashboard/emails',
  '/dashboard/settings',
];

export function useKeyboardShortcuts(handlers?: ShortcutHandlers) {
  const navigate = useNavigate();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't trigger in input/textarea/contenteditable
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      // Only allow Escape in inputs
      if (e.key === 'Escape') {
        (target as HTMLInputElement).blur();
        return;
      }
      return;
    }

    // Ctrl+K: Global search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      handlers?.onSearch?.();
      return;
    }

    // Ctrl+S: Scan (in BgcComplete)
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handlers?.onScan?.();
      return;
    }

    // Escape: Close panels/dialogs (handled by Radix)
    if (e.key === 'Escape') {
      return;
    }

    // Number keys 1-7: Tab navigation
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      const num = parseInt(e.key);
      if (num >= 1 && num <= 7 && TAB_ROUTES[num - 1]) {
        navigate(TAB_ROUTES[num - 1]);
        return;
      }
    }
  }, [navigate, handlers]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
