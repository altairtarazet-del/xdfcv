import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SMTP_API_URL = 'https://api.smtp.dev';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('SMTPDEV_API_KEY');
    if (!apiKey) {
      throw new Error('SMTP API key not configured');
    }

    // Parse body once and extract all needed values
    const body = await req.json();
    const { action, accountId, mailboxId, messageId, filters, page, email, password } = body;

    const headers = {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
    };

    let result;

    switch (action) {
      case 'getAccounts': {
        // Add page parameter for pagination
        const url = page ? `${SMTP_API_URL}/accounts?page=${page}` : `${SMTP_API_URL}/accounts`;
        console.log('Fetching accounts from:', url);
        const response = await fetch(url, { headers });
        if (!response.ok) {
          const text = await response.text();
          console.error('API Error Response:', text);
          throw new Error(`API Error: ${response.status}`);
        }
        const data = await response.json();
        console.log('Accounts response:', JSON.stringify(data));
        
        // SMTP.dev returns { member: [...], totalItems, view } structure
        const accounts = data.member || data.data || [];
        
        result = { 
          accounts: accounts.map((acc: any) => ({
            id: acc.id,
            name: acc.address || acc.name,
            address: acc.address,
            mailboxes: (acc.mailboxes || []).map((mb: any) => ({
              id: mb.id,
              name: mb.path || mb.name,
              path: mb.path,
            })),
          })),
          totalItems: data.totalItems || accounts.length,
          view: data.view || null,
        };
        break;
      }

      case 'createAccount': {
        // Use already parsed body values
        const createBody: any = {};
        if (email) createBody.address = email;
        if (password) createBody.password = password;

        console.log('Creating account with:', JSON.stringify(createBody));
        const response = await fetch(`${SMTP_API_URL}/accounts`, {
          method: 'POST',
          headers,
          body: JSON.stringify(createBody),
        });
        
        if (!response.ok) {
          const text = await response.text();
          console.error('API Error Response:', text);
          throw new Error(`API Error: ${response.status}`);
        }
        result = await response.json();
        break;
      }

      case 'changePassword': {
        // Use already parsed body values
        if (!accountId) throw new Error('accountId required');
        if (!password) throw new Error('password required');

        console.log('Changing password for account:', accountId);
        const response = await fetch(`${SMTP_API_URL}/accounts/${accountId}`, {
          method: 'PATCH',
          headers: {
            'X-API-KEY': apiKey,
            'Content-Type': 'application/merge-patch+json',
          },
          body: JSON.stringify({ password }),
        });
        
        if (!response.ok) {
          const text = await response.text();
          console.error('API Error Response:', text);
          throw new Error(`API Error: ${response.status}`);
        }
        result = await response.json();
        break;
      }

      case 'getMailboxes': {
        if (!accountId) throw new Error('accountId required');
        
        const response = await fetch(`${SMTP_API_URL}/accounts/${accountId}/mailboxes`, { headers });
        if (!response.ok) {
          const text = await response.text();
          console.error('API Error Response:', text);
          throw new Error(`API Error: ${response.status}`);
        }
        const data = await response.json();
        const mailboxes = data.member || data.data || [];
        result = { 
          mailboxes: mailboxes.map((mb: any) => ({
            id: mb.id,
            name: mb.path || mb.name,
            path: mb.path,
          }))
        };
        break;
      }

      case 'getMessages': {
        if (!accountId) throw new Error('accountId required');
        if (!mailboxId) throw new Error('mailboxId required');
        
        // Add page parameter for pagination
        const url = page 
          ? `${SMTP_API_URL}/accounts/${accountId}/mailboxes/${mailboxId}/messages?page=${page}`
          : `${SMTP_API_URL}/accounts/${accountId}/mailboxes/${mailboxId}/messages`;
        console.log('Fetching messages from:', url);
        const response = await fetch(url, { headers });
        if (!response.ok) {
          const text = await response.text();
          console.error('API Error Response:', text);
          throw new Error(`API Error: ${response.status}`);
        }
        const data = await response.json();
        console.log('Messages response totalItems:', data.totalItems, 'view:', JSON.stringify(data.view));
        
        let messages = data.member || data.data || [];

        // Apply filters
        if (filters) {
          const now = new Date();

          if (filters.timeFilterMinutes) {
            const cutoff = new Date(now.getTime() - filters.timeFilterMinutes * 60000);
            messages = messages.filter((m: any) => {
              const msgDate = new Date(m.createdAt || m.date || m.receivedAt);
              return msgDate >= cutoff;
            });
          }

          if (filters.allowedSenders?.length) {
            messages = messages.filter((m: any) => {
              const fromAddr = m.from?.address || m.from || '';
              return filters.allowedSenders.some((s: string) => 
                s.startsWith('*@') 
                  ? fromAddr.endsWith(s.slice(1))
                  : fromAddr === s
              );
            });
          }

          if (filters.allowedReceivers?.length) {
            messages = messages.filter((m: any) => {
              const toList = Array.isArray(m.to) ? m.to : [m.to];
              const toAddrs = toList.map((t: any) => t?.address || t || '');
              return toAddrs.some((addr: string) => filters.allowedReceivers.includes(addr));
            });
          }

          // Subject filtering with wildcard support
          if (filters.allowedSubjects?.length) {
            messages = messages.filter((m: any) => {
              const subject = (m.subject || '').toLowerCase();
              return filters.allowedSubjects.some((pattern: string) => {
                const p = pattern.toLowerCase();
                // Wildcard support: *code* or Checkr:*
                if (p.startsWith('*') && p.endsWith('*') && p.length > 2) {
                  return subject.includes(p.slice(1, -1));
                } else if (p.startsWith('*')) {
                  return subject.endsWith(p.slice(1));
                } else if (p.endsWith('*')) {
                  return subject.startsWith(p.slice(0, -1));
                }
                return subject === p;
              });
            });
          }
        }

        result = {
          messages,
          totalItems: data.totalItems || messages.length,
          view: data.view || null,
        };
        break;
      }

      case 'getMessage': {
        if (!accountId) throw new Error('accountId required');
        if (!mailboxId) throw new Error('mailboxId required');
        if (!messageId) throw new Error('messageId required');

        const response = await fetch(`${SMTP_API_URL}/accounts/${accountId}/mailboxes/${mailboxId}/messages/${messageId}`, { headers });
        if (!response.ok) {
          const text = await response.text();
          console.error('API Error Response:', text);
          throw new Error(`API Error: ${response.status}`);
        }
        result = await response.json();
        break;
      }

      case 'getAttachment': {
        const { attachmentId } = body;
        if (!accountId) throw new Error('accountId required');
        if (!mailboxId) throw new Error('mailboxId required');
        if (!messageId) throw new Error('messageId required');
        if (!attachmentId) throw new Error('attachmentId required');

        console.log('Fetching attachment:', attachmentId);
        const response = await fetch(
          `${SMTP_API_URL}/accounts/${accountId}/mailboxes/${mailboxId}/messages/${messageId}/attachments/${attachmentId}`,
          { headers }
        );
        if (!response.ok) {
          const text = await response.text();
          console.error('API Error Response:', text);
          throw new Error(`API Error: ${response.status}`);
        }
        
        // Get the attachment data as arrayBuffer then convert to base64
        const arrayBuffer = await response.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        
        result = { 
          data: base64, 
          contentType,
          filename: body.filename || 'attachment'
        };
        break;
      }

      case 'deleteAccount': {
        if (!accountId) throw new Error('accountId required');

        console.log('Deleting account:', accountId);
        const response = await fetch(`${SMTP_API_URL}/accounts/${accountId}`, {
          method: 'DELETE',
          headers,
        });
        
        if (!response.ok) {
          const text = await response.text();
          console.error('API Error Response:', text);
          throw new Error(`API Error: ${response.status}`);
        }
        result = { success: true, message: 'Account deleted' };
        break;
      }

      case 'deleteAllMessages': {
        if (!accountId) throw new Error('accountId required');
        if (!mailboxId) throw new Error('mailboxId required');

        console.log('Deleting all messages from mailbox:', mailboxId);
        
        // First get all messages
        const listResponse = await fetch(`${SMTP_API_URL}/accounts/${accountId}/mailboxes/${mailboxId}/messages`, { headers });
        if (!listResponse.ok) {
          throw new Error(`Failed to list messages: ${listResponse.status}`);
        }
        const listData = await listResponse.json();
        const messages = listData.member || listData.data || [];
        
        // Delete each message
        let deletedCount = 0;
        for (const msg of messages) {
          try {
            const delResponse = await fetch(`${SMTP_API_URL}/accounts/${accountId}/mailboxes/${mailboxId}/messages/${msg.id}`, {
              method: 'DELETE',
              headers,
            });
            if (delResponse.ok) deletedCount++;
          } catch (e) {
            console.error('Failed to delete message:', msg.id, e);
          }
        }
        
        result = { success: true, deletedCount, totalMessages: messages.length };
        break;
      }

      case 'deleteAllMailboxMessages': {
        // Delete messages from all mailboxes (inbox + trash)
        if (!accountId) throw new Error('accountId required');

        console.log('Deleting all messages from all mailboxes for account:', accountId);
        
        // First get all mailboxes
        const mbResponse = await fetch(`${SMTP_API_URL}/accounts/${accountId}/mailboxes`, { headers });
        if (!mbResponse.ok) {
          throw new Error(`Failed to list mailboxes: ${mbResponse.status}`);
        }
        const mbData = await mbResponse.json();
        const mailboxes = mbData.member || mbData.data || [];
        
        let totalDeleted = 0;
        
        for (const mailbox of mailboxes) {
          // Get messages in this mailbox
          const listResponse = await fetch(`${SMTP_API_URL}/accounts/${accountId}/mailboxes/${mailbox.id}/messages`, { headers });
          if (!listResponse.ok) continue;
          
          const listData = await listResponse.json();
          const messages = listData.member || listData.data || [];
          
          // Delete each message
          for (const msg of messages) {
            try {
              const delResponse = await fetch(`${SMTP_API_URL}/accounts/${accountId}/mailboxes/${mailbox.id}/messages/${msg.id}`, {
                method: 'DELETE',
                headers,
              });
              if (delResponse.ok) totalDeleted++;
            } catch (e) {
              console.error('Failed to delete message:', msg.id, e);
            }
          }
        }
        
        result = { success: true, deletedCount: totalDeleted };
        break;
      }

      case 'scanBgcComplete': {
        // Initialize Supabase client with service role for DB operations
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        // BGC Complete subject pattern
        const BGC_PATTERN = 'your background check is complete';
        const SCAN_FOLDERS = ['INBOX', 'Trash', 'Junk', 'Spam'];
        
        const newBgcEmails: any[] = [];
        let scannedMailboxes = 0;
        let messagesScanned = 0;
        let skippedMessages = 0;
        
        console.log('[BGC] Starting incremental scan...');
        
        // 1. Get existing scan statuses from DB
        const { data: scanStatuses } = await supabase
          .from('bgc_scan_status')
          .select('*');
        
        const statusMap = new Map(
          (scanStatuses || []).map((s: any) => [s.account_id, s])
        );
        
        console.log(`[BGC] Found ${statusMap.size} previously scanned accounts`);
        
        // 2. Get existing BGC email IDs to avoid duplicates
        const { data: existingEmails } = await supabase
          .from('bgc_complete_emails')
          .select('account_id, mailbox_id, message_id');
        
        const existingIds = new Set(
          (existingEmails || []).map((e: any) => `${e.account_id}_${e.mailbox_id}_${e.message_id}`)
        );
        
        console.log(`[BGC] ${existingIds.size} emails already in database`);
        
        // 3. Fetch all accounts with pagination
        let allAccounts: any[] = [];
        let currentPage = 1;
        let hasMorePages = true;
        
        while (hasMorePages) {
          const accountsUrl = `${SMTP_API_URL}/accounts?page=${currentPage}`;
          console.log('[BGC] Fetching accounts page:', currentPage);
          
          const res = await fetch(accountsUrl, { headers });
          if (!res.ok) {
            const text = await res.text();
            console.error('[BGC] Failed to fetch accounts:', text);
            throw new Error(`Failed to fetch accounts: ${res.status}`);
          }
          
          const data = await res.json();
          const accounts = data.member || [];
          allAccounts = [...allAccounts, ...accounts];
          
          // Check pagination
          if (data.view?.last) {
            const pageMatch = data.view.last.match(/page=(\d+)/);
            const totalPages = pageMatch ? parseInt(pageMatch[1]) : currentPage;
            hasMorePages = currentPage < totalPages;
            currentPage++;
          } else {
            hasMorePages = false;
          }
        }
        
        console.log(`[BGC] Found ${allAccounts.length} accounts to scan`);
        
        // 4. For each account, get mailboxes and scan messages
        for (const account of allAccounts) {
          try {
            const lastScan = statusMap.get(account.id);
            const cutoffDate = lastScan?.last_scanned_at ? new Date(lastScan.last_scanned_at) : null;
            
            if (cutoffDate) {
              console.log(`[BGC] Account ${account.address}: scanning messages after ${cutoffDate.toISOString()}`);
            } else {
              console.log(`[BGC] Account ${account.address}: first time scan (no cutoff)`);
            }
            
            // Get mailboxes for this account
            const mbRes = await fetch(`${SMTP_API_URL}/accounts/${account.id}/mailboxes`, { headers });
            if (!mbRes.ok) {
              console.error(`[BGC] Failed to fetch mailboxes for account ${account.id}`);
              continue;
            }
            
            const mbData = await mbRes.json();
            const mailboxes = (mbData.member || []).filter((mb: any) => 
              SCAN_FOLDERS.some(f => (mb.path || '').toUpperCase().includes(f.toUpperCase()))
            );
            
            // 5. For each mailbox, get messages with pagination
            for (const mailbox of mailboxes) {
              scannedMailboxes++;
              let msgPage = 1;
              let hasMoreMsgs = true;
              let reachedOldMessages = false;
              
              while (hasMoreMsgs && !reachedOldMessages) {
                const msgUrl = `${SMTP_API_URL}/accounts/${account.id}/mailboxes/${mailbox.id}/messages?page=${msgPage}`;
                
                const msgRes = await fetch(msgUrl, { headers });
                if (!msgRes.ok) {
                  console.error(`[BGC] Failed to fetch messages for mailbox ${mailbox.id}`);
                  break;
                }
                
                const msgData = await msgRes.json();
                const messages = msgData.member || [];
                messagesScanned += messages.length;
                
                // 6. Filter for BGC subjects (only new messages)
                for (const msg of messages) {
                  const msgDate = new Date(msg.createdAt || msg.date || msg.receivedAt);
                  
                  // Skip if message is older than last scan
                  if (cutoffDate && msgDate <= cutoffDate) {
                    skippedMessages++;
                    reachedOldMessages = true;
                    continue;
                  }
                  
                  const subject = (msg.subject || '').toLowerCase();
                  const isBgc = subject.includes(BGC_PATTERN);
                  
                  if (isBgc) {
                    const uniqueKey = `${account.id}_${mailbox.id}_${msg.id}`;
                    
                    // Skip if already in database
                    if (!existingIds.has(uniqueKey)) {
                      const fromData = msg.from || {};
                      newBgcEmails.push({
                        account_id: account.id,
                        account_email: account.address,
                        mailbox_id: mailbox.id,
                        mailbox_path: mailbox.path,
                        message_id: msg.id,
                        subject: msg.subject,
                        from_address: typeof fromData === 'string' ? fromData : fromData.address,
                        from_name: typeof fromData === 'string' ? null : fromData.name,
                        email_date: msg.createdAt || msg.date || msg.receivedAt
                      });
                      existingIds.add(uniqueKey); // Prevent duplicates in same scan
                      console.log(`[BGC] NEW: ${msg.subject} from ${account.address}`);
                    }
                  }
                }
                
                // Check message pagination
                if (msgData.view?.next && !reachedOldMessages) {
                  msgPage++;
                } else {
                  hasMoreMsgs = false;
                }
              }
            }
            
            // 7. Update scan status for this account
            await supabase.from('bgc_scan_status').upsert({
              account_id: account.id,
              account_email: account.address,
              last_scanned_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }, { onConflict: 'account_id' });
            
          } catch (e) {
            console.error(`[BGC] Error processing account ${account.id}:`, e);
          }
        }
        
        // 8. Insert new BGC emails to database
        if (newBgcEmails.length > 0) {
          const { error: insertError } = await supabase
            .from('bgc_complete_emails')
            .upsert(newBgcEmails, { 
              onConflict: 'account_id,mailbox_id,message_id',
              ignoreDuplicates: true 
            });
          
          if (insertError) {
            console.error('[BGC] Error inserting emails:', insertError);
          } else {
            console.log(`[BGC] Inserted ${newBgcEmails.length} new emails to database`);
          }
        }
        
        // 9. Get total count from database
        const { count: totalInDb } = await supabase
          .from('bgc_complete_emails')
          .select('*', { count: 'exact', head: true });
        
        console.log(`[BGC] Scan complete. New: ${newBgcEmails.length}, Total in DB: ${totalInDb}, Skipped: ${skippedMessages}`);
        
        result = {
          newFound: newBgcEmails.length,
          totalInDb: totalInDb || 0,
          scannedAccounts: allAccounts.length,
          scannedMailboxes,
          messagesScanned,
          skippedMessages
        };
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('SMTP API Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
