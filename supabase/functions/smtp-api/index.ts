import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
        // Ultra-fast BGC scan with date filtering and one-per-account logic
        const bgcSubject = body.subjectFilter || '*background check is complete*';
        const daysLimit = body.daysLimit || 7; // Default: son 7 gün
        const onePerAccount = body.onePerAccount !== false; // Default: true
        
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysLimit);
        
        console.log(`BGC scan starting: subject=${bgcSubject}, days=${daysLimit}, onePerAccount=${onePerAccount}, cutoff=${cutoffDate.toISOString()}`);
        
        const allBgcEmails: any[] = [];
        const foundAccountIds = new Set<string>(); // Track accounts already found
        
        // Step 1: Fetch all accounts (parallel pagination)
        let allAccounts: any[] = [];
        const firstPage = await fetch(`${SMTP_API_URL}/accounts?page=1`, { headers });
        if (!firstPage.ok) throw new Error('Failed to fetch accounts');
        const firstData = await firstPage.json();
        allAccounts = firstData.member || [];
        
        // Parse total pages from 'last' URL (format: "/accounts?page=X")
        let totalPages = 1;
        if (firstData.view?.last) {
          const lastUrl = firstData.view.last;
          const pageMatch = lastUrl.match(/page=(\d+)/);
          if (pageMatch) {
            totalPages = parseInt(pageMatch[1], 10);
          }
        }
        
        console.log(`[BGC] Page 1: ${allAccounts.length} accounts, total pages: ${totalPages}`);
        
        if (totalPages > 1) {
          const pagePromises = [];
          for (let p = 2; p <= Math.min(totalPages, 50); p++) {
            pagePromises.push(
              fetch(`${SMTP_API_URL}/accounts?page=${p}`, { headers })
                .then(r => r.ok ? r.json() : null)
            );
          }
          const pageResults = await Promise.all(pagePromises);
          pageResults.forEach(data => {
            if (data?.member) allAccounts = [...allAccounts, ...data.member];
          });
        }
        
        console.log(`[BGC] Total accounts after pagination: ${allAccounts.length}`);
        
        console.log(`Found ${allAccounts.length} accounts, fetching mailboxes...`);
        
        // Step 2: Fetch all mailboxes in parallel (high concurrency)
        const CONCURRENCY = 50;
        const accountsWithInbox: { account: any; inboxId: string }[] = [];
        
        for (let i = 0; i < allAccounts.length; i += CONCURRENCY) {
          const batch = allAccounts.slice(i, i + CONCURRENCY);
          const promises = batch.map(account =>
            fetch(`${SMTP_API_URL}/accounts/${account.id}/mailboxes`, { headers })
              .then(r => r.ok ? r.json() : null)
              .then(data => ({ account, data }))
              .catch(() => ({ account, data: null }))
          );
          const results = await Promise.all(promises);
          results.forEach(({ account, data }) => {
            if (data?.member) {
              const inbox = data.member.find((mb: any) => mb.path?.toUpperCase() === 'INBOX');
              if (inbox) accountsWithInbox.push({ account, inboxId: inbox.id });
            }
          });
        }
        
        console.log(`Found ${accountsWithInbox.length} accounts with INBOX, scanning messages...`);
        
        // Helper function to filter messages by subject and date
        const pattern = bgcSubject.toLowerCase();
        const filterAndAddMessages = (messages: any[], account: any, inboxId: string): boolean => {
          let foundForThisAccount = false;
          
          for (const m of messages) {
            // Skip if onePerAccount and already found for this account
            if (onePerAccount && foundAccountIds.has(account.id)) break;
            
            // Date check - skip messages older than cutoff
            const msgDate = new Date(m.createdAt || m.date);
            if (msgDate < cutoffDate) continue;
            
            // Subject matching
            const subject = (m.subject || '').toLowerCase();
            let matches = false;
            if (pattern.startsWith('*') && pattern.endsWith('*') && pattern.length > 2) {
              matches = subject.includes(pattern.slice(1, -1));
            } else if (pattern.startsWith('*')) {
              matches = subject.endsWith(pattern.slice(1));
            } else if (pattern.endsWith('*')) {
              matches = subject.startsWith(pattern.slice(0, -1));
            } else {
              matches = subject === pattern;
            }
            
            if (matches) {
              allBgcEmails.push({
                id: m.id,
                accountEmail: account.address || account.name,
                accountId: account.id,
                mailboxId: inboxId,
                from: m.from?.address || m.from?.name || 'Unknown',
                subject: m.subject || 'Your background check is complete',
                date: m.createdAt || m.date,
                isRead: m.seen || false,
                preview: m.intro || ''
              });
              foundAccountIds.add(account.id);
              foundForThisAccount = true;
              
              // If onePerAccount, stop after first match
              if (onePerAccount) break;
            }
          }
          return foundForThisAccount;
        };

        // Step 3: Fetch ONLY first page of messages (with date filter, first page is enough for 7 days)
        for (let i = 0; i < accountsWithInbox.length; i += CONCURRENCY) {
          const batch = accountsWithInbox.slice(i, i + CONCURRENCY);
          
          const promises = batch.map(({ account, inboxId }) =>
            fetch(`${SMTP_API_URL}/accounts/${account.id}/mailboxes/${inboxId}/messages?page=1`, { headers })
              .then(r => r.ok ? r.json() : null)
              .then(data => ({ account, inboxId, data }))
              .catch(() => ({ account, inboxId, data: null }))
          );
          const results = await Promise.all(promises);
          
          for (const { account, inboxId, data } of results) {
            if (!data?.member) continue;
            filterAndAddMessages(data.member, account, inboxId);
          }
        }
        
        // Sort by date descending
        allBgcEmails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        
        console.log(`BGC scan complete. Found ${allBgcEmails.length} emails from ${allAccounts.length} accounts.`);
        result = { 
          emails: allBgcEmails, 
          totalAccounts: allAccounts.length,
          scannedAt: new Date().toISOString()
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
