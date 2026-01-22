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
        
        // Email subject patterns to track
        const PATTERNS = {
          bgc_complete: 'your background check is complete',
          deactivated: 'your dasher account has been deactivated',
          first_package: [
            'congratulations, your dasher welcome gift is on its way!',
            'your first dash, done.',
            'hey, you made it 🥂 here\'s 40% off'
          ]
        };
        const SCAN_FOLDERS = ['INBOX', 'Trash', 'Junk', 'Spam'];
        
        const newBgcEmails: any[] = [];
        const newDeactivatedEmails: any[] = [];
        const newFirstPackageEmails: any[] = [];
        let scannedMailboxes = 0;
        let messagesScanned = 0;
        let skippedMessages = 0;
        
        console.log('[BGC] Starting scan...');
        
        // 1. Get existing scan statuses from DB (for BGC incremental scan)
        const { data: scanStatuses } = await supabase
          .from('bgc_scan_status')
          .select('*');
        
        const statusMap = new Map(
          (scanStatuses || []).map((s: any) => [s.account_id, s])
        );
        
        console.log(`[BGC] Found ${statusMap.size} previously scanned accounts`);
        
        // 2. Get existing BGC email IDs and accounts to avoid duplicates
        const { data: existingBgcEmails } = await supabase
          .from('bgc_complete_emails')
          .select('account_id, account_email, mailbox_id, message_id')
          .eq('email_type', 'bgc_complete');
        
        const existingBgcIds = new Set(
          (existingBgcEmails || []).map((e: any) => `${e.account_id}_${e.mailbox_id}_${e.message_id}`)
        );
        
        // Set of accounts that have BGC complete (for deactivation scan)
        const bgcAccountIds = new Set(
          (existingBgcEmails || []).map((e: any) => e.account_id)
        );
        const bgcAccountEmails = new Set(
          (existingBgcEmails || []).map((e: any) => e.account_email)
        );
        
        console.log(`[BGC] ${existingBgcIds.size} BGC emails in database, ${bgcAccountIds.size} unique accounts`);
        
        // 3. Get already deactivated accounts (to skip them)
        const { data: existingDeactivated } = await supabase
          .from('bgc_complete_emails')
          .select('account_id, account_email, mailbox_id, message_id')
          .eq('email_type', 'deactivated');
        
        const alreadyDeactivatedEmails = new Set(
          (existingDeactivated || []).map((e: any) => e.account_email)
        );
        const existingDeactivatedIds = new Set(
          (existingDeactivated || []).map((e: any) => `${e.account_id}_${e.mailbox_id}_${e.message_id}`)
        );
        
        console.log(`[BGC] ${alreadyDeactivatedEmails.size} accounts already marked as deactivated`);
        
        // 3.5. Get already first_package accounts (to skip them)
        const { data: existingFirstPackage } = await supabase
          .from('bgc_complete_emails')
          .select('account_id, account_email, mailbox_id, message_id')
          .eq('email_type', 'first_package');
        
        const alreadyFirstPackageEmails = new Set(
          (existingFirstPackage || []).map((e: any) => e.account_email)
        );
        const existingFirstPackageIds = new Set(
          (existingFirstPackage || []).map((e: any) => `${e.account_id}_${e.mailbox_id}_${e.message_id}`)
        );
        
        console.log(`[BGC] ${alreadyFirstPackageEmails.size} accounts already have first package`);
        
        // 4. Fetch all accounts with pagination
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
        
        console.log(`[BGC] Found ${allAccounts.length} accounts total`);
        
        // 5. Scan each account
        for (const account of allAccounts) {
          try {
            const lastScan = statusMap.get(account.id);
            const cutoffDate = lastScan?.last_scanned_at ? new Date(lastScan.last_scanned_at) : null;
            
            // Determine if we need to scan for deactivation (only if account has BGC and not yet deactivated)
            const shouldScanDeactivation = bgcAccountIds.has(account.id) && !alreadyDeactivatedEmails.has(account.address);
            
            if (cutoffDate) {
              console.log(`[BGC] Account ${account.address}: BGC scan after ${cutoffDate.toISOString()}, deactivation scan: ${shouldScanDeactivation}`);
            } else {
              console.log(`[BGC] Account ${account.address}: first time BGC scan, deactivation scan: ${shouldScanDeactivation}`);
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
            
            // 6. For each mailbox, get messages with pagination
            for (const mailbox of mailboxes) {
              scannedMailboxes++;
              let msgPage = 1;
              let hasMoreMsgs = true;
              let reachedOldMessagesForBgc = false;
              
              while (hasMoreMsgs) {
                const msgUrl = `${SMTP_API_URL}/accounts/${account.id}/mailboxes/${mailbox.id}/messages?page=${msgPage}`;
                
                const msgRes = await fetch(msgUrl, { headers });
                if (!msgRes.ok) {
                  console.error(`[BGC] Failed to fetch messages for mailbox ${mailbox.id}`);
                  break;
                }
                
                const msgData = await msgRes.json();
                const messages = msgData.member || [];
                messagesScanned += messages.length;
                
                // 7. Process each message
                for (const msg of messages) {
                  const msgDate = new Date(msg.createdAt || msg.date || msg.receivedAt);
                  const subject = (msg.subject || '').toLowerCase();
                  const uniqueKey = `${account.id}_${mailbox.id}_${msg.id}`;
                  
                  const fromData = msg.from || {};
                  const baseEmailData = {
                    account_id: account.id,
                    account_email: account.address,
                    mailbox_id: mailbox.id,
                    mailbox_path: mailbox.path,
                    message_id: msg.id,
                    subject: msg.subject,
                    from_address: typeof fromData === 'string' ? fromData : fromData.address,
                    from_name: typeof fromData === 'string' ? null : fromData.name,
                    email_date: msg.createdAt || msg.date || msg.receivedAt
                  };
                  
                  // BGC Complete scan (incremental - respects cutoff date)
                  const isBgcComplete = subject.includes(PATTERNS.bgc_complete);
                  if (isBgcComplete) {
                    // Check cutoff for BGC (incremental scan)
                    if (cutoffDate && msgDate <= cutoffDate) {
                      skippedMessages++;
                      reachedOldMessagesForBgc = true;
                    } else if (!existingBgcIds.has(uniqueKey)) {
                      newBgcEmails.push({ ...baseEmailData, email_type: 'bgc_complete' });
                      existingBgcIds.add(uniqueKey);
                      // Add to BGC account sets so deactivation scan can find it
                      bgcAccountIds.add(account.id);
                      bgcAccountEmails.add(account.address);
                      console.log(`[BGC] NEW BGC Complete: ${msg.subject} from ${account.address}`);
                    }
                  }
                  
                  // Deactivation scan (only for BGC accounts, no cutoff - scans all messages)
                  const isDeactivated = subject.includes(PATTERNS.deactivated);
                  if (isDeactivated && shouldScanDeactivation && !existingDeactivatedIds.has(uniqueKey)) {
                    newDeactivatedEmails.push({ ...baseEmailData, email_type: 'deactivated' });
                    existingDeactivatedIds.add(uniqueKey);
                    // Mark this account as deactivated so we don't scan again
                    alreadyDeactivatedEmails.add(account.address);
                    console.log(`[BGC] NEW Deactivated: ${msg.subject} from ${account.address}`);
                  }
                }
                
                // Check message pagination - for deactivation we scan all pages, for BGC we can stop at old messages
                // If we only found old BGC messages and no deactivation scan needed, we can stop
                if (msgData.view?.next) {
                  // Continue if we need deactivation scan OR we haven't reached old BGC messages
                  if (shouldScanDeactivation || !reachedOldMessagesForBgc) {
                    msgPage++;
                  } else {
                    hasMoreMsgs = false;
                  }
                } else {
                  hasMoreMsgs = false;
                }
              }
            }
            
            // 8. Update scan status for this account (for BGC incremental tracking)
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
        
        // 9. Insert new emails to database (both BGC complete and deactivated)
        const allNewEmails = [...newBgcEmails, ...newDeactivatedEmails];
        
        if (allNewEmails.length > 0) {
          const { error: insertError } = await supabase
            .from('bgc_complete_emails')
            .upsert(allNewEmails, { 
              onConflict: 'account_id,mailbox_id,message_id',
              ignoreDuplicates: true 
            });
          
          if (insertError) {
            console.error('[BGC] Error inserting emails:', insertError);
          } else {
            console.log(`[BGC] Inserted ${allNewEmails.length} new emails to database (${newBgcEmails.length} BGC, ${newDeactivatedEmails.length} deactivated)`);
          }
        }
        
        // 10. Get counts from database
        const { count: totalBgcInDb } = await supabase
          .from('bgc_complete_emails')
          .select('*', { count: 'exact', head: true })
          .eq('email_type', 'bgc_complete');
        
        const { count: totalDeactivatedInDb } = await supabase
          .from('bgc_complete_emails')
          .select('*', { count: 'exact', head: true })
          .eq('email_type', 'deactivated');
        
        console.log(`[BGC] Scan complete. New BGC: ${newBgcEmails.length}, New Deactivated: ${newDeactivatedEmails.length}, Total BGC: ${totalBgcInDb}, Total Deactivated: ${totalDeactivatedInDb}`);
        
        result = {
          newBgcFound: newBgcEmails.length,
          newDeactivatedFound: newDeactivatedEmails.length,
          totalBgcInDb: totalBgcInDb || 0,
          totalDeactivatedInDb: totalDeactivatedInDb || 0
        };
        break;
      }

      case 'scanFirstPackage': {
        // Scan only Clear accounts for first package patterns
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        const FIRST_PACKAGE_PATTERNS = [
          'congratulations, your dasher welcome gift is on its way!',
          'your first dash, done.',
          'hey, you made it 🥂 here\'s 40% off'
        ];
        const SCAN_FOLDERS = ['INBOX', 'Trash', 'Junk', 'Spam'];
        
        const newFirstPackageEmails: any[] = [];
        let messagesScanned = 0;
        
        console.log('[FIRST_PACKAGE] Starting scan...');
        
        // 1. Get BGC complete accounts
        const { data: bgcAccounts } = await supabase
          .from('bgc_complete_emails')
          .select('account_id, account_email')
          .eq('email_type', 'bgc_complete');
        
        const bgcAccountMap = new Map(
          (bgcAccounts || []).map((e: any) => [e.account_id, e.account_email])
        );
        
        console.log(`[FIRST_PACKAGE] ${bgcAccountMap.size} BGC accounts`);
        
        // 2. Get deactivated accounts (these are NOT clear)
        const { data: deactivatedAccounts } = await supabase
          .from('bgc_complete_emails')
          .select('account_email')
          .eq('email_type', 'deactivated');
        
        const deactivatedEmails = new Set(
          (deactivatedAccounts || []).map((e: any) => e.account_email)
        );
        
        // 3. Get already first_package accounts
        const { data: existingFirstPackage } = await supabase
          .from('bgc_complete_emails')
          .select('account_id, account_email, mailbox_id, message_id')
          .eq('email_type', 'first_package');
        
        const alreadyFirstPackageEmails = new Set(
          (existingFirstPackage || []).map((e: any) => e.account_email)
        );
        const existingFirstPackageIds = new Set(
          (existingFirstPackage || []).map((e: any) => `${e.account_id}_${e.mailbox_id}_${e.message_id}`)
        );
        
        console.log(`[FIRST_PACKAGE] ${deactivatedEmails.size} deactivated, ${alreadyFirstPackageEmails.size} already have first package`);
        
        // 4. Build list of Clear accounts (BGC complete but not deactivated, not already first package)
        const clearAccountIds: string[] = [];
        for (const [accountId, email] of bgcAccountMap.entries()) {
          if (!deactivatedEmails.has(email) && !alreadyFirstPackageEmails.has(email)) {
            clearAccountIds.push(accountId);
          }
        }
        
        console.log(`[FIRST_PACKAGE] ${clearAccountIds.length} Clear accounts to scan`);
        
        // 5. Scan each Clear account for first package patterns
        for (const accountId of clearAccountIds) {
          try {
            const accountEmail = bgcAccountMap.get(accountId)!;
            
            // Get account details for mailboxes
            const mbRes = await fetch(`${SMTP_API_URL}/accounts/${accountId}/mailboxes`, { headers });
            if (!mbRes.ok) {
              console.error(`[FIRST_PACKAGE] Failed to fetch mailboxes for account ${accountId}`);
              continue;
            }
            
            const mbData = await mbRes.json();
            const mailboxes = (mbData.member || []).filter((mb: any) => 
              SCAN_FOLDERS.some(f => (mb.path || '').toUpperCase().includes(f.toUpperCase()))
            );
            
            let foundFirstPackage = false;
            
            for (const mailbox of mailboxes) {
              if (foundFirstPackage) break;
              
              let msgPage = 1;
              let hasMoreMsgs = true;
              
              while (hasMoreMsgs && !foundFirstPackage) {
                const msgUrl = `${SMTP_API_URL}/accounts/${accountId}/mailboxes/${mailbox.id}/messages?page=${msgPage}`;
                
                const msgRes = await fetch(msgUrl, { headers });
                if (!msgRes.ok) break;
                
                const msgData = await msgRes.json();
                const messages = msgData.member || [];
                messagesScanned += messages.length;
                
                for (const msg of messages) {
                  const subject = (msg.subject || '').toLowerCase();
                  const uniqueKey = `${accountId}_${mailbox.id}_${msg.id}`;
                  
                  // Check if matches any first package pattern
                  const isFirstPackage = FIRST_PACKAGE_PATTERNS.some(p => subject.includes(p));
                  
                  if (isFirstPackage && !existingFirstPackageIds.has(uniqueKey)) {
                    const fromData = msg.from || {};
                    newFirstPackageEmails.push({
                      account_id: accountId,
                      account_email: accountEmail,
                      mailbox_id: mailbox.id,
                      mailbox_path: mailbox.path,
                      message_id: msg.id,
                      subject: msg.subject,
                      from_address: typeof fromData === 'string' ? fromData : fromData.address,
                      from_name: typeof fromData === 'string' ? null : fromData.name,
                      email_date: msg.createdAt || msg.date || msg.receivedAt,
                      email_type: 'first_package'
                    });
                    existingFirstPackageIds.add(uniqueKey);
                    alreadyFirstPackageEmails.add(accountEmail);
                    foundFirstPackage = true;
                    console.log(`[FIRST_PACKAGE] Found: ${msg.subject} from ${accountEmail}`);
                    break;
                  }
                }
                
                if (msgData.view?.next && !foundFirstPackage) {
                  msgPage++;
                } else {
                  hasMoreMsgs = false;
                }
              }
            }
          } catch (e) {
            console.error(`[FIRST_PACKAGE] Error processing account ${accountId}:`, e);
          }
        }
        
        // 6. Insert new first package emails
        if (newFirstPackageEmails.length > 0) {
          const { error: insertError } = await supabase
            .from('bgc_complete_emails')
            .upsert(newFirstPackageEmails, { 
              onConflict: 'account_id,mailbox_id,message_id',
              ignoreDuplicates: true 
            });
          
          if (insertError) {
            console.error('[FIRST_PACKAGE] Error inserting emails:', insertError);
          } else {
            console.log(`[FIRST_PACKAGE] Inserted ${newFirstPackageEmails.length} new first package emails`);
          }
        }
        
        // 7. Get total count
        const { count: totalFirstPackageInDb } = await supabase
          .from('bgc_complete_emails')
          .select('*', { count: 'exact', head: true })
          .eq('email_type', 'first_package');
        
        console.log(`[FIRST_PACKAGE] Scan complete. New: ${newFirstPackageEmails.length}, Total: ${totalFirstPackageInDb}`);
        
        result = {
          newFirstPackageFound: newFirstPackageEmails.length,
          totalFirstPackageInDb: totalFirstPackageInDb || 0,
          scannedAccounts: clearAccountIds.length,
          messagesScanned
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
