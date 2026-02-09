import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || '*';
const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SMTP_API_URL = 'https://api.smtp.dev';

// Batch size for parallel processing
const ACCOUNT_BATCH_SIZE = 10;

// --- AI Helper Functions ---

async function classifyEmailWithAI(subject: string, bodyText: string): Promise<{ email_type: string; confidence: number }> {
  const apiKey = Deno.env.get('SYNTHETIC_API_KEY');
  const apiUrl = Deno.env.get('SYNTHETIC_API_URL') || 'https://api.openai.com/v1';

  if (!apiKey) return { email_type: 'none', confidence: 0 };

  try {
    const response = await fetch(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: 'You classify DoorDash/Dasher emails. Return JSON only. Types: bgc_complete, deactivated, first_package, none. Fields: email_type, confidence (0-1).'
          },
          {
            role: 'user',
            content: `Subject: ${subject}\n\nBody: ${(bodyText || '').slice(0, 1000)}`
          }
        ],
        temperature: 0,
        max_tokens: 100
      })
    });

    if (!response.ok) return { email_type: 'none', confidence: 0 };

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const parsed = JSON.parse(content.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
    return { email_type: parsed.email_type || 'none', confidence: parsed.confidence || 0 };
  } catch (e) {
    console.error('[AI] Classification error:', e);
    return { email_type: 'none', confidence: 0 };
  }
}

async function extractEmailData(subject: string, bodyText: string, emailType: string): Promise<Record<string, any>> {
  const apiKey = Deno.env.get('SYNTHETIC_API_KEY');
  const apiUrl = Deno.env.get('SYNTHETIC_API_URL') || 'https://api.openai.com/v1';

  if (!apiKey) return {};

  try {
    const response = await fetch(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: 'Extract structured data from DoorDash/Dasher email. Return JSON with fields: check_result, activation_date, dasher_region, reference_number, deactivation_reason, raw_summary. Use null for unavailable fields.'
          },
          {
            role: 'user',
            content: `Type: ${emailType}\nSubject: ${subject}\n\nBody: ${(bodyText || '').slice(0, 2000)}`
          }
        ],
        temperature: 0,
        max_tokens: 300
      })
    });

    if (!response.ok) return {};

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    return JSON.parse(content.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
  } catch (e) {
    console.error('[AI] Extraction error:', e);
    return {};
  }
}

async function fetchEmailBody(accountId: string, mailboxId: string, messageId: string, headers: Record<string, string>): Promise<string> {
  try {
    const response = await fetch(`${SMTP_API_URL}/accounts/${accountId}/mailboxes/${mailboxId}/messages/${messageId}`, { headers });
    if (!response.ok) return '';

    const data = await response.json();
    // SMTP.dev returns text and/or html body
    return data.text || data.html?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || '';
  } catch (e) {
    console.error('[FETCH_BODY] Error:', e);
    return '';
  }
}

async function createNotifications(
  supabaseClient: any,
  type: string,
  title: string,
  message: string,
  metadata: Record<string, any> = {}
) {
  try {
    // Get all users with BGC permission (admins + users with can_view_bgc_complete)
    const { data: adminRoles } = await supabaseClient
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin');

    const { data: bgcRoles } = await supabaseClient
      .from('user_roles')
      .select('user_id, role_permissions!inner(can_view_bgc_complete)')
      .not('custom_role_id', 'is', null);

    const userIds = new Set<string>();
    (adminRoles || []).forEach((r: any) => userIds.add(r.user_id));
    (bgcRoles || []).forEach((r: any) => {
      if (r.role_permissions?.can_view_bgc_complete) userIds.add(r.user_id);
    });

    if (userIds.size === 0) return;

    const notifications = Array.from(userIds).map(userId => ({
      user_id: userId,
      type,
      title,
      message,
      metadata
    }));

    const { error } = await supabaseClient.from('notifications').insert(notifications);
    if (error) console.error('[NOTIFY] Insert error:', error);
    else console.log(`[NOTIFY] Created ${notifications.length} notifications of type ${type}`);
  } catch (e) {
    console.error('[NOTIFY] Error:', e);
  }
}

// Helper: Scan a single account for BGC Complete and Deactivation patterns
async function scanSingleAccountBgc(
  account: any,
  headers: Record<string, string>,
  statusMap: Map<string, any>,
  existingBgcIds: Set<string>,
  bgcAccountIds: Set<string>,
  bgcAccountEmails: Set<string>,
  shouldScanDeactivation: boolean,
  existingDeactivatedIds: Set<string>,
  alreadyDeactivatedEmails: Set<string>,
  PATTERNS: { bgc_complete: string[]; deactivated: string },
  SCAN_FOLDERS: string[]
): Promise<{ bgcEmails: any[]; deactivatedEmails: any[]; messagesScanned: number; scannedMailboxes: number; skippedMessages: number }> {
  const bgcEmails: any[] = [];
  const deactivatedEmails: any[] = [];
  let messagesScanned = 0;
  let scannedMailboxes = 0;
  let skippedMessages = 0;
  
  try {
    const lastScan = statusMap.get(account.id);
    const cutoffDate = lastScan?.last_scanned_at ? new Date(lastScan.last_scanned_at) : null;
    
    // Get mailboxes for this account
    const mbRes = await fetch(`${SMTP_API_URL}/accounts/${account.id}/mailboxes`, { headers });
    if (!mbRes.ok) {
      console.error(`[BGC] Failed to fetch mailboxes for account ${account.id}`);
      return { bgcEmails, deactivatedEmails, messagesScanned, scannedMailboxes, skippedMessages };
    }
    
    const mbData = await mbRes.json();
    const mailboxes = (mbData.member || []).filter((mb: any) => 
      SCAN_FOLDERS.some(f => (mb.path || '').toUpperCase().includes(f.toUpperCase()))
    );
    
    // Scan mailboxes in parallel
    const mailboxResults = await Promise.all(
      mailboxes.map(async (mailbox: any) => {
        const mbBgcEmails: any[] = [];
        const mbDeactivatedEmails: any[] = [];
        let mbMessagesScanned = 0;
        let mbSkippedMessages = 0;
        let reachedOldMessagesForBgc = false;
        
        let msgPage = 1;
        let hasMoreMsgs = true;
        
        while (hasMoreMsgs) {
          const msgUrl = `${SMTP_API_URL}/accounts/${account.id}/mailboxes/${mailbox.id}/messages?page=${msgPage}`;
          
          const msgRes = await fetch(msgUrl, { headers });
          if (!msgRes.ok) break;
          
          const msgData = await msgRes.json();
          const messages = msgData.member || [];
          mbMessagesScanned += messages.length;
          
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
            const isBgcComplete = PATTERNS.bgc_complete.some(p => subject.includes(p));
            if (isBgcComplete) {
              if (cutoffDate && msgDate <= cutoffDate) {
                mbSkippedMessages++;
                reachedOldMessagesForBgc = true;
              } else if (!existingBgcIds.has(uniqueKey)) {
                mbBgcEmails.push({ ...baseEmailData, email_type: 'bgc_complete' });
              }
            }
            
            // Deactivation scan (only for BGC accounts, no cutoff)
            const isDeactivated = subject.includes(PATTERNS.deactivated);
            if (isDeactivated && shouldScanDeactivation && !existingDeactivatedIds.has(uniqueKey)) {
              mbDeactivatedEmails.push({ ...baseEmailData, email_type: 'deactivated' });
            }
          }
          
          // Pagination logic
          if (msgData.view?.next) {
            if (shouldScanDeactivation || !reachedOldMessagesForBgc) {
              msgPage++;
            } else {
              hasMoreMsgs = false;
            }
          } else {
            hasMoreMsgs = false;
          }
        }
        
        return { 
          bgcEmails: mbBgcEmails, 
          deactivatedEmails: mbDeactivatedEmails, 
          messagesScanned: mbMessagesScanned,
          skippedMessages: mbSkippedMessages
        };
      })
    );
    
    // Aggregate mailbox results
    for (const mbResult of mailboxResults) {
      bgcEmails.push(...mbResult.bgcEmails);
      deactivatedEmails.push(...mbResult.deactivatedEmails);
      messagesScanned += mbResult.messagesScanned;
      skippedMessages += mbResult.skippedMessages;
    }
    scannedMailboxes = mailboxes.length;
    
  } catch (e) {
    console.error(`[BGC] Error processing account ${account.id}:`, e);
  }
  
  return { bgcEmails, deactivatedEmails, messagesScanned, scannedMailboxes, skippedMessages };
}

// Helper: Scan a single account for First Package patterns
async function scanSingleAccountFirstPackage(
  accountId: string,
  accountEmail: string,
  headers: Record<string, string>,
  existingFirstPackageIds: Set<string>,
  FIRST_PACKAGE_PATTERNS: string[],
  SCAN_FOLDERS: string[],
  cutoffDate: Date | null = null
): Promise<{ firstPackageEmails: any[]; messagesScanned: number }> {
  const firstPackageEmails: any[] = [];
  let messagesScanned = 0;
  
  try {
    const mbRes = await fetch(`${SMTP_API_URL}/accounts/${accountId}/mailboxes`, { headers });
    if (!mbRes.ok) {
      console.error(`[FIRST_PACKAGE] Failed to fetch mailboxes for account ${accountId}`);
      return { firstPackageEmails, messagesScanned };
    }
    
    const mbData = await mbRes.json();
    const mailboxes = (mbData.member || []).filter((mb: any) => 
      SCAN_FOLDERS.some(f => (mb.path || '').toUpperCase().includes(f.toUpperCase()))
    );
    
    let foundFirstPackage = false;
    
    // Scan mailboxes sequentially for early exit
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
          const msgDate = new Date(msg.createdAt || msg.date || msg.receivedAt);

          // Skip messages older than cutoff (incremental scan)
          if (cutoffDate && msgDate <= cutoffDate) {
            continue;
          }

          const subject = (msg.subject || '').toLowerCase();
          const uniqueKey = `${accountId}_${mailbox.id}_${msg.id}`;

          const isFirstPackage = FIRST_PACKAGE_PATTERNS.some(p => subject.includes(p));
          
          if (isFirstPackage && !existingFirstPackageIds.has(uniqueKey)) {
            const fromData = msg.from || {};
            firstPackageEmails.push({
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
  
  return { firstPackageEmails, messagesScanned };
}

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

    // Shared Supabase client for DB operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseClient = supabaseUrl && supabaseServiceKey
      ? createClient(supabaseUrl, supabaseServiceKey)
      : null;

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
        const defaultPassword = Deno.env.get('DEFAULT_ACCOUNT_PASSWORD') || 'ChangeMe!123';
        const createBody: any = {};
        if (email) createBody.address = email;
        createBody.password = password || defaultPassword;

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

        const hasActiveFilters = filters && (
          filters.timeFilterMinutes ||
          filters.allowedSenders?.length ||
          filters.allowedReceivers?.length ||
          filters.allowedSubjects?.length
        );

        result = {
          messages,
          totalItems: hasActiveFilters ? messages.length : (data.totalItems || messages.length),
          view: hasActiveFilters ? null : (data.view || null),
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
        
        // Get the attachment data as arrayBuffer then convert to base64 (chunk-safe)
        const arrayBuffer = await response.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let base64 = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.subarray(i, i + chunkSize);
          base64 += String.fromCharCode(...chunk);
        }
        base64 = btoa(base64);
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

        let deletedCount = 0;
        let totalMessages = 0;
        let hasMore = true;

        while (hasMore) {
          const listResponse = await fetch(`${SMTP_API_URL}/accounts/${accountId}/mailboxes/${mailboxId}/messages`, { headers });
          if (!listResponse.ok) {
            throw new Error(`Failed to list messages: ${listResponse.status}`);
          }
          const listData = await listResponse.json();
          const messages = listData.member || listData.data || [];

          if (messages.length === 0) {
            hasMore = false;
            break;
          }

          totalMessages += messages.length;

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

          // If we deleted fewer than received, there might be an issue — stop to avoid infinite loop
          if (deletedCount < totalMessages) {
            hasMore = false;
          }
        }

        result = { success: true, deletedCount, totalMessages };
        break;
      }

      case 'deleteAllMailboxMessages': {
        // Delete messages from all mailboxes (inbox + trash)
        if (!accountId) throw new Error('accountId required');

        console.log('Deleting all messages from all mailboxes for account:', accountId);

        const mbResponse = await fetch(`${SMTP_API_URL}/accounts/${accountId}/mailboxes`, { headers });
        if (!mbResponse.ok) {
          throw new Error(`Failed to list mailboxes: ${mbResponse.status}`);
        }
        const mbData = await mbResponse.json();
        const allMailboxes = mbData.member || mbData.data || [];

        let totalDeleted = 0;

        for (const mailbox of allMailboxes) {
          let hasMore = true;
          while (hasMore) {
            const listResponse = await fetch(`${SMTP_API_URL}/accounts/${accountId}/mailboxes/${mailbox.id}/messages`, { headers });
            if (!listResponse.ok) { hasMore = false; break; }

            const listData = await listResponse.json();
            const msgs = listData.member || listData.data || [];

            if (msgs.length === 0) { hasMore = false; break; }

            let batchDeleted = 0;
            for (const msg of msgs) {
              try {
                const delResponse = await fetch(`${SMTP_API_URL}/accounts/${accountId}/mailboxes/${mailbox.id}/messages/${msg.id}`, {
                  method: 'DELETE',
                  headers,
                });
                if (delResponse.ok) { totalDeleted++; batchDeleted++; }
              } catch (e) {
                console.error('Failed to delete message:', msg.id, e);
              }
            }

            // Stop if nothing was deleted to avoid infinite loop
            if (batchDeleted === 0) hasMore = false;
          }
        }

        result = { success: true, deletedCount: totalDeleted };
        break;
      }

      case 'scanBgcComplete': {
        if (!supabaseClient) throw new Error('Supabase not configured');

        // Email subject patterns to track
        const PATTERNS = {
          bgc_complete: ['your background check is complete'],
          deactivated: 'your dasher account has been deactivated',
        };
        const SCAN_FOLDERS = ['INBOX', 'Trash', 'Junk', 'Spam'];
        
        const newBgcEmails: any[] = [];
        const newDeactivatedEmails: any[] = [];
        let scannedMailboxes = 0;
        let messagesScanned = 0;
        let skippedMessages = 0;
        
        console.log('[BGC] Starting PARALLEL scan...');
        const startTime = Date.now();
        
        // 1. Get existing scan statuses from DB (for BGC incremental scan)
        const { data: scanStatuses } = await supabaseClient
          .from('bgc_scan_status')
          .select('*');
        
        const statusMap = new Map(
          (scanStatuses || []).map((s: any) => [s.account_id, s])
        );
        
        console.log(`[BGC] Found ${statusMap.size} previously scanned accounts`);
        
        // 2. Get existing BGC email IDs and accounts to avoid duplicates
        const { data: existingBgcEmails } = await supabaseClient
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
        const { data: existingDeactivated } = await supabaseClient
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
        
        // 5. Process accounts in parallel batches
        const batches: any[][] = [];
        for (let i = 0; i < allAccounts.length; i += ACCOUNT_BATCH_SIZE) {
          batches.push(allAccounts.slice(i, i + ACCOUNT_BATCH_SIZE));
        }
        
        console.log(`[BGC] Processing ${batches.length} batches of ${ACCOUNT_BATCH_SIZE} accounts each`);
        
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
          const batch = batches[batchIndex];
          console.log(`[BGC] Processing batch ${batchIndex + 1}/${batches.length}`);

          // Safety: stop if approaching timeout (50s limit)
          const MAX_EXECUTION_MS = 50000;
          if (Date.now() - startTime > MAX_EXECUTION_MS) {
            console.log(`[BGC] Approaching timeout at batch ${batchIndex + 1}, stopping early`);
            break;
          }

          // Save state before batch for re-scan of newly discovered BGC accounts
          const bgcAccountIdsBeforeBatch = new Set(bgcAccountIds);

          // Process batch in parallel
          const batchResults = await Promise.all(
            batch.map(account => {
              const shouldScanDeactivation = bgcAccountIds.has(account.id) && !alreadyDeactivatedEmails.has(account.address);
              
              return scanSingleAccountBgc(
                account,
                headers,
                statusMap,
                existingBgcIds,
                bgcAccountIds,
                bgcAccountEmails,
                shouldScanDeactivation,
                existingDeactivatedIds,
                alreadyDeactivatedEmails,
                PATTERNS,
                SCAN_FOLDERS
              );
            })
          );
          
          // Aggregate batch results
          for (const accountResult of batchResults) {
            newBgcEmails.push(...accountResult.bgcEmails);
            newDeactivatedEmails.push(...accountResult.deactivatedEmails);
            messagesScanned += accountResult.messagesScanned;
            scannedMailboxes += accountResult.scannedMailboxes;
            skippedMessages += accountResult.skippedMessages;
            
            // Add new BGC accounts to sets for deactivation tracking
            for (const bgcEmail of accountResult.bgcEmails) {
              existingBgcIds.add(`${bgcEmail.account_id}_${bgcEmail.mailbox_id}_${bgcEmail.message_id}`);
              bgcAccountIds.add(bgcEmail.account_id);
              bgcAccountEmails.add(bgcEmail.account_email);
            }
            
            // Add new deactivated accounts to set
            for (const deactEmail of accountResult.deactivatedEmails) {
              existingDeactivatedIds.add(`${deactEmail.account_id}_${deactEmail.mailbox_id}_${deactEmail.message_id}`);
              alreadyDeactivatedEmails.add(deactEmail.account_email);
            }
          }

          // Re-scan newly discovered BGC accounts for deactivation (they were missed in the initial batch)
          const newlyDiscoveredBgcInBatch = batchResults.flatMap(r => r.bgcEmails)
            .filter(e => !bgcAccountIdsBeforeBatch.has(e.account_id));

          if (newlyDiscoveredBgcInBatch.length > 0) {
            const newBgcAccountIds = new Set(newlyDiscoveredBgcInBatch.map(e => e.account_id));
            const accountsToRescan = batch.filter(a => newBgcAccountIds.has(a.id) && !alreadyDeactivatedEmails.has(a.address));

            if (accountsToRescan.length > 0) {
              console.log(`[BGC] Re-scanning ${accountsToRescan.length} newly discovered BGC accounts for deactivation`);
              const deactResults = await Promise.all(
                accountsToRescan.map(account =>
                  scanSingleAccountBgc(
                    account, headers, statusMap,
                    existingBgcIds, bgcAccountIds, bgcAccountEmails,
                    true, // force deactivation scan
                    existingDeactivatedIds, alreadyDeactivatedEmails,
                    PATTERNS, SCAN_FOLDERS
                  )
                )
              );
              for (const deactResult of deactResults) {
                newDeactivatedEmails.push(...deactResult.deactivatedEmails);
                for (const deactEmail of deactResult.deactivatedEmails) {
                  existingDeactivatedIds.add(`${deactEmail.account_id}_${deactEmail.mailbox_id}_${deactEmail.message_id}`);
                  alreadyDeactivatedEmails.add(deactEmail.account_email);
                }
              }
            }
          }

          // Update scan status for batch accounts
          const statusUpdates = batch.map(account => ({
            account_id: account.id,
            account_email: account.address,
            last_scanned_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }));
          
          await supabaseClient.from('bgc_scan_status').upsert(statusUpdates, { onConflict: 'account_id' });
        }
        
        const elapsedMs = Date.now() - startTime;
        console.log(`[BGC] Parallel scan completed in ${elapsedMs}ms (${(elapsedMs/1000).toFixed(1)}s)`);
        
        // 6. Insert new emails to database (both BGC complete and deactivated)
        const allNewEmails = [...newBgcEmails, ...newDeactivatedEmails];

        if (allNewEmails.length > 0) {
          const { data: insertedEmails, error: insertError } = await supabaseClient
            .from('bgc_complete_emails')
            .upsert(allNewEmails, {
              onConflict: 'account_id,mailbox_id,message_id',
              ignoreDuplicates: true
            })
            .select('id, account_email, email_type, email_date');

          if (insertError) {
            console.error('[BGC] Error inserting emails:', insertError);
          } else {
            console.log(`[BGC] Inserted ${allNewEmails.length} new emails to database (${newBgcEmails.length} BGC, ${newDeactivatedEmails.length} deactivated)`);

            // Create account_events for new emails
            if (insertedEmails && insertedEmails.length > 0) {
              const events = insertedEmails.map((e: any) => ({
                account_email: e.account_email,
                event_type: e.email_type === 'bgc_complete' ? 'bgc_complete' : 'deactivated',
                event_date: e.email_date,
                source_email_id: e.id
              }));
              const { error: eventError } = await supabaseClient.from('account_events').insert(events);
              if (eventError) console.error('[BGC] Error inserting events:', eventError);
            }
          }

          // Send notifications
          if (newBgcEmails.length > 0) {
            const emails = [...new Set(newBgcEmails.map(e => e.account_email))];
            await createNotifications(
              supabaseClient,
              'new_bgc_complete',
              `${newBgcEmails.length} Yeni BGC Complete`,
              `Yeni BGC tamamlanan hesaplar: ${emails.slice(0, 3).map(e => e.split('@')[0]).join(', ')}${emails.length > 3 ? ` ve ${emails.length - 3} daha` : ''}`,
              { count: newBgcEmails.length, emails: emails.slice(0, 10) }
            );
          }

          if (newDeactivatedEmails.length > 0) {
            const emails = [...new Set(newDeactivatedEmails.map(e => e.account_email))];
            await createNotifications(
              supabaseClient,
              'new_deactivation',
              `${newDeactivatedEmails.length} Yeni Deaktivasyon`,
              `Deaktive edilen hesaplar: ${emails.slice(0, 3).map(e => e.split('@')[0]).join(', ')}${emails.length > 3 ? ` ve ${emails.length - 3} daha` : ''}`,
              { count: newDeactivatedEmails.length, emails: emails.slice(0, 10) }
            );
          }
        }
        
        // 7. Get counts from database
        const { count: totalBgcInDb } = await supabaseClient
          .from('bgc_complete_emails')
          .select('*', { count: 'exact', head: true })
          .eq('email_type', 'bgc_complete');

        const { count: totalDeactivatedInDb } = await supabaseClient
          .from('bgc_complete_emails')
          .select('*', { count: 'exact', head: true })
          .eq('email_type', 'deactivated');
        
        console.log(`[BGC] Scan complete. New BGC: ${newBgcEmails.length}, New Deactivated: ${newDeactivatedEmails.length}, Total BGC: ${totalBgcInDb}, Total Deactivated: ${totalDeactivatedInDb}`);
        
        result = {
          newBgcFound: newBgcEmails.length,
          newDeactivatedFound: newDeactivatedEmails.length,
          totalBgcInDb: totalBgcInDb || 0,
          totalDeactivatedInDb: totalDeactivatedInDb || 0,
          elapsedMs,
          accountsScanned: allAccounts.length,
          messagesScanned
        };
        break;
      }

      case 'scanFirstPackage': {
        if (!supabaseClient) throw new Error('Supabase not configured');

        // Scan only Clear accounts for first package patterns
        const FIRST_PACKAGE_PATTERNS = [
          'congratulations, your dasher welcome gift is on its way!',
          'your first dash, done.',
          'hey, you made it 🥂 here\'s 40% off'
        ];
        const SCAN_FOLDERS = ['INBOX', 'Trash', 'Junk', 'Spam'];
        
        const newFirstPackageEmails: any[] = [];
        let messagesScanned = 0;
        
        console.log('[FIRST_PACKAGE] Starting PARALLEL scan...');
        const startTime = Date.now();
        
        // 1. Get BGC complete accounts
        const { data: bgcAccounts } = await supabaseClient
          .from('bgc_complete_emails')
          .select('account_id, account_email')
          .eq('email_type', 'bgc_complete');
        
        const bgcAccountMap = new Map(
          (bgcAccounts || []).map((e: any) => [e.account_id, e.account_email])
        );
        
        console.log(`[FIRST_PACKAGE] ${bgcAccountMap.size} BGC accounts`);
        
        // 2. Get deactivated accounts (these are NOT clear)
        const { data: deactivatedAccounts } = await supabaseClient
          .from('bgc_complete_emails')
          .select('account_email')
          .eq('email_type', 'deactivated');
        
        const deactivatedEmails = new Set(
          (deactivatedAccounts || []).map((e: any) => e.account_email)
        );
        
        // 3. Get already first_package accounts
        const { data: existingFirstPackage } = await supabaseClient
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

        // Get scan statuses for incremental scanning
        const { data: fpScanStatuses } = await supabaseClient
          .from('bgc_scan_status')
          .select('account_id, last_scanned_at');

        const fpStatusMap = new Map(
          (fpScanStatuses || []).map((s: any) => [s.account_id, s.last_scanned_at])
        );

        // 4. Build list of Clear accounts (BGC complete but not deactivated, not already first package)
        const clearAccounts: { id: string; email: string }[] = [];
        for (const [accountId, email] of bgcAccountMap.entries()) {
          if (!deactivatedEmails.has(email) && !alreadyFirstPackageEmails.has(email)) {
            clearAccounts.push({ id: accountId, email });
          }
        }
        
        console.log(`[FIRST_PACKAGE] ${clearAccounts.length} Clear accounts to scan`);
        
        // 5. Process accounts in parallel batches
        const batches: { id: string; email: string }[][] = [];
        for (let i = 0; i < clearAccounts.length; i += ACCOUNT_BATCH_SIZE) {
          batches.push(clearAccounts.slice(i, i + ACCOUNT_BATCH_SIZE));
        }
        
        console.log(`[FIRST_PACKAGE] Processing ${batches.length} batches of ${ACCOUNT_BATCH_SIZE} accounts each`);
        
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
          const batch = batches[batchIndex];
          console.log(`[FIRST_PACKAGE] Processing batch ${batchIndex + 1}/${batches.length}`);

          // Safety: stop if approaching timeout (50s limit)
          const MAX_EXECUTION_MS = 50000;
          if (Date.now() - startTime > MAX_EXECUTION_MS) {
            console.log(`[FIRST_PACKAGE] Approaching timeout at batch ${batchIndex + 1}, stopping early`);
            break;
          }

          // Process batch in parallel
          const batchResults = await Promise.all(
            batch.map(account => {
              const lastScanned = fpStatusMap.get(account.id);
              const cutoff = lastScanned ? new Date(lastScanned) : null;
              return scanSingleAccountFirstPackage(
                account.id,
                account.email,
                headers,
                existingFirstPackageIds,
                FIRST_PACKAGE_PATTERNS,
                SCAN_FOLDERS,
                cutoff
              );
            })
          );
          
          // Aggregate batch results
          for (const accountResult of batchResults) {
            newFirstPackageEmails.push(...accountResult.firstPackageEmails);
            messagesScanned += accountResult.messagesScanned;
            
            // Add to set to avoid duplicates within this scan
            for (const fpEmail of accountResult.firstPackageEmails) {
              existingFirstPackageIds.add(`${fpEmail.account_id}_${fpEmail.mailbox_id}_${fpEmail.message_id}`);
              alreadyFirstPackageEmails.add(fpEmail.account_email);
            }
          }
        }
        
        const elapsedMs = Date.now() - startTime;
        console.log(`[FIRST_PACKAGE] Parallel scan completed in ${elapsedMs}ms (${(elapsedMs/1000).toFixed(1)}s)`);
        
        // 6. Insert new first package emails
        if (newFirstPackageEmails.length > 0) {
          const { error: insertError } = await supabaseClient
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
        const { count: totalFirstPackageInDb } = await supabaseClient
          .from('bgc_complete_emails')
          .select('*', { count: 'exact', head: true })
          .eq('email_type', 'first_package');
        
        console.log(`[FIRST_PACKAGE] Scan complete. New: ${newFirstPackageEmails.length}, Total: ${totalFirstPackageInDb}`);
        
        result = {
          newFirstPackageFound: newFirstPackageEmails.length,
          totalFirstPackageInDb: totalFirstPackageInDb || 0,
          scannedAccounts: clearAccounts.length,
          messagesScanned,
          elapsedMs
        };
        break;
      }

      case 'classifyAndExtract': {
        // On-demand AI classification + data extraction for a single email
        if (!supabaseClient) throw new Error('Supabase not configured');
        const { emailId } = body;
        if (!emailId) throw new Error('emailId required');

        // Fetch email record
        const { data: emailRecord, error: emailErr } = await supabaseClient
          .from('bgc_complete_emails')
          .select('*')
          .eq('id', emailId)
          .single();

        if (emailErr || !emailRecord) throw new Error('Email not found');

        // Fetch email body from SMTP.dev
        const bodyText = await fetchEmailBody(
          emailRecord.account_id,
          emailRecord.mailbox_id,
          emailRecord.message_id,
          headers
        );

        // AI classification
        const classification = await classifyEmailWithAI(emailRecord.subject, bodyText);

        // AI extraction
        const extracted = await extractEmailData(
          emailRecord.subject,
          bodyText,
          classification.email_type !== 'none' ? classification.email_type : emailRecord.email_type
        );

        // Update the email record
        const { error: updateErr } = await supabaseClient
          .from('bgc_complete_emails')
          .update({
            ai_classified: true,
            ai_confidence: classification.confidence,
            extracted_data: extracted,
            email_body_fetched: bodyText.length > 0
          })
          .eq('id', emailId);

        if (updateErr) console.error('[AI] Update error:', updateErr);

        result = {
          classification,
          extracted_data: extracted,
          body_length: bodyText.length,
          success: !updateErr
        };
        break;
      }

      case 'calculateRiskScores': {
        if (!supabaseClient) throw new Error('Supabase not configured');

        // Get all BGC complete accounts
        const { data: bgcEmails } = await supabaseClient
          .from('bgc_complete_emails')
          .select('account_email, email_date, email_type')
          .order('email_date', { ascending: true });

        if (!bgcEmails || bgcEmails.length === 0) {
          result = { calculated: 0 };
          break;
        }

        // Build per-account data
        const accountData = new Map<string, { bgcDate?: Date; deactDate?: Date; firstPkgDate?: Date }>();
        for (const email of bgcEmails) {
          if (!accountData.has(email.account_email)) {
            accountData.set(email.account_email, {});
          }
          const acct = accountData.get(email.account_email)!;
          const date = new Date(email.email_date);
          if (email.email_type === 'bgc_complete' && (!acct.bgcDate || date < acct.bgcDate)) acct.bgcDate = date;
          if (email.email_type === 'deactivated' && (!acct.deactDate || date < acct.deactDate)) acct.deactDate = date;
          if (email.email_type === 'first_package' && (!acct.firstPkgDate || date < acct.firstPkgDate)) acct.firstPkgDate = date;
        }

        // Calculate average days-to-deactivation from historical data
        const deactDays: number[] = [];
        for (const [, data] of accountData) {
          if (data.bgcDate && data.deactDate) {
            deactDays.push((data.deactDate.getTime() - data.bgcDate.getTime()) / (1000 * 60 * 60 * 24));
          }
        }
        const avgDeactDays = deactDays.length > 0 ? deactDays.reduce((a, b) => a + b, 0) / deactDays.length : 30;

        // Calculate risk for Clear accounts only
        const now = new Date();
        const riskScores: { account_email: string; risk_score: number; risk_factors: any[] }[] = [];

        for (const [email, data] of accountData) {
          if (data.deactDate) continue; // Already deactivated, skip
          if (!data.bgcDate) continue;

          const daysSinceBgc = (now.getTime() - data.bgcDate.getTime()) / (1000 * 60 * 60 * 24);
          const factors: string[] = [];
          let score = 0;

          // Time-based risk: how close to avg deactivation time
          const timeRatio = daysSinceBgc / avgDeactDays;
          if (timeRatio >= 1.0) {
            score += 40;
            factors.push(`BGC'den bu yana ${Math.round(daysSinceBgc)} gün (ortalama: ${Math.round(avgDeactDays)} gün)`);
          } else if (timeRatio >= 0.7) {
            score += 25;
            factors.push(`BGC'den bu yana ${Math.round(daysSinceBgc)} gün (ortalamanın %${Math.round(timeRatio * 100)}'i)`);
          } else if (timeRatio >= 0.4) {
            score += 10;
          }

          // Missing first package after 14+ days
          if (!data.firstPkgDate && daysSinceBgc >= 14) {
            score += 25;
            factors.push(`14+ gün olmasına rağmen ilk paket yok`);
          }

          // Very new account (< 3 days) - low risk
          if (daysSinceBgc < 3) {
            score = Math.max(0, score - 15);
          }

          riskScores.push({
            account_email: email,
            risk_score: Math.min(100, Math.max(0, score)),
            risk_factors: factors
          });
        }

        // Upsert risk scores
        if (riskScores.length > 0) {
          const upsertData = riskScores.map(rs => ({
            account_email: rs.account_email,
            risk_score: rs.risk_score,
            risk_factors: rs.risk_factors,
            last_calculated_at: new Date().toISOString()
          }));

          const { error: riskErr } = await supabaseClient
            .from('bgc_risk_scores')
            .upsert(upsertData, { onConflict: 'account_email' });

          if (riskErr) console.error('[RISK] Upsert error:', riskErr);
        }

        result = {
          calculated: riskScores.length,
          avgDeactivationDays: Math.round(avgDeactDays),
          highRisk: riskScores.filter(r => r.risk_score >= 50).length,
          mediumRisk: riskScores.filter(r => r.risk_score >= 25 && r.risk_score < 50).length,
          lowRisk: riskScores.filter(r => r.risk_score < 25).length
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
