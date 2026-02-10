import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Send, Minus, X, RefreshCw, Maximize2 } from 'lucide-react';

interface MailComposeWindowProps {
  open: boolean;
  onClose: () => void;
  fromEmail: string;
  onSend: (to: string, subject: string, body: string) => Promise<void>;
  isSending: boolean;
}

export function MailComposeWindow({ open, onClose, fromEmail, onSend, isSending }: MailComposeWindowProps) {
  const [minimized, setMinimized] = useState(false);
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const handleSend = async () => {
    await onSend(to, subject, body);
    setTo('');
    setSubject('');
    setBody('');
  };

  const handleClose = () => {
    if (!isSending) {
      setTo('');
      setSubject('');
      setBody('');
      setMinimized(false);
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ y: 400, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 400, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed bottom-0 right-6 z-50 w-[480px] max-w-[calc(100vw-3rem)] compose-shadow rounded-t-xl bg-card border border-border border-b-0 flex flex-col"
        >
          {/* Title Bar */}
          <div
            className="flex items-center justify-between px-4 py-2.5 bg-muted/50 rounded-t-xl border-b border-border cursor-pointer select-none"
            onClick={() => setMinimized(!minimized)}
          >
            <div className="flex items-center gap-2">
              <Send size={14} className="text-primary" />
              <span className="text-sm font-medium text-foreground">Yeni Mesaj</span>
            </div>
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={(e) => { e.stopPropagation(); setMinimized(!minimized); }}
              >
                {minimized ? <Maximize2 size={12} /> : <Minus size={12} />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 hover:text-destructive"
                onClick={(e) => { e.stopPropagation(); handleClose(); }}
              >
                <X size={12} />
              </Button>
            </div>
          </div>

          {/* Body (collapsible) */}
          <AnimatePresence>
            {!minimized && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="p-4 space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Gonderen</Label>
                    <Input
                      value={fromEmail}
                      disabled
                      className="mt-1 text-sm bg-muted/30 h-8"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Alici *</Label>
                    <Input
                      placeholder="ornek@email.com"
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      className="mt-1 text-sm h-8"
                      disabled={isSending}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Konu *</Label>
                    <Input
                      placeholder="Email konusu"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="mt-1 text-sm h-8"
                      disabled={isSending}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Mesaj</Label>
                    <Textarea
                      placeholder="Mesajinizi yazin..."
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      className="mt-1 text-sm min-h-[120px] resize-y"
                      disabled={isSending}
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleClose}
                      disabled={isSending}
                    >
                      Iptal
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSend}
                      disabled={isSending || !to.trim() || !subject.trim()}
                      className="gap-1.5"
                    >
                      {isSending ? (
                        <>
                          <RefreshCw size={14} className="animate-spin" />
                          Gonderiliyor...
                        </>
                      ) : (
                        <>
                          <Send size={14} />
                          Gonder
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
