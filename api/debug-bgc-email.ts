import type { VercelRequest, VercelResponse } from '@vercel/node';

// Temporary debug endpoint to investigate BGC email attachments
// Usage: GET /api/debug-bgc-email?email=oktaydogan@dasherhelp.com
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Missing Supabase configuration' });
  }

  const targetEmail = (req.query.email as string) || 'oktaydogan@dasherhelp.com';
  const edgeFunctionUrl = `${supabaseUrl}/functions/v1/smtp-api`;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${serviceRoleKey}`,
  };

  try {
    // Step 1: Find the account by fetching all accounts and matching email
    let allAccounts: any[] = [];
    let currentPage = 1;
    let hasMore = true;

    while (hasMore) {
      const accRes = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'getAccounts', page: currentPage }),
      });
      const accData = await accRes.json();
      const accounts = accData.member || [];
      allAccounts = [...allAccounts, ...accounts];

      if (accData.view?.last) {
        const pageMatch = accData.view.last.match(/page=(\d+)/);
        const totalPages = pageMatch ? parseInt(pageMatch[1]) : currentPage;
        hasMore = currentPage < totalPages;
        currentPage++;
      } else {
        hasMore = false;
      }
    }

    const account = allAccounts.find((a: any) => a.address === targetEmail);
    if (!account) {
      return res.status(404).json({ error: `Account ${targetEmail} not found`, totalAccounts: allAccounts.length });
    }

    // Step 2: Get mailboxes
    const mbRes = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'getMailboxes', accountId: account.id }),
    });
    const mailboxes = await mbRes.json();
    const inbox = (mailboxes.member || []).find((mb: any) =>
      (mb.path || '').toUpperCase().includes('INBOX')
    );

    if (!inbox) {
      return res.status(404).json({ error: 'INBOX not found', mailboxes: mailboxes.member?.map((m: any) => m.path) });
    }

    // Step 3: Find the BGC complete email by scanning messages
    const bgcSubject = 'your background check is complete';
    let bgcMessage: any = null;
    let msgPage = 1;
    let hasMoreMsgs = true;

    while (hasMoreMsgs && !bgcMessage) {
      const msgRes = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'getMessages', accountId: account.id, mailboxId: inbox.id, page: msgPage }),
      });
      const msgData = await msgRes.json();
      const messages = msgData.member || [];

      for (const msg of messages) {
        if ((msg.subject || '').toLowerCase().includes(bgcSubject)) {
          bgcMessage = msg;
          break;
        }
      }

      if (msgData.view?.next && !bgcMessage) {
        msgPage++;
      } else {
        hasMoreMsgs = false;
      }
    }

    if (!bgcMessage) {
      return res.status(404).json({ error: 'BGC complete email not found in INBOX' });
    }

    // Step 4: Get full message details (body + attachments)
    const fullMsgRes = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'getMessage',
        accountId: account.id,
        mailboxId: inbox.id,
        messageId: bgcMessage.id,
      }),
    });
    const fullMsg = await fullMsgRes.json();

    // Step 5: Collect attachment info
    const attachmentDetails: any[] = [];
    const attachments = fullMsg.attachments || [];

    for (const att of attachments) {
      // Download attachment
      const attRes = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'getAttachment',
          accountId: account.id,
          mailboxId: inbox.id,
          messageId: bgcMessage.id,
          attachmentId: att.id,
          filename: att.filename || att.name,
        }),
      });
      const attData = await attRes.json();

      // Decode base64 to see raw text content
      let rawText = '';
      try {
        const binaryStr = atob(attData.data);
        // Extract readable ASCII strings from the binary data
        const readable: string[] = [];
        let current = '';
        for (let i = 0; i < binaryStr.length; i++) {
          const code = binaryStr.charCodeAt(i);
          if (code >= 32 && code < 127) {
            current += binaryStr[i];
          } else {
            if (current.length >= 3) {
              readable.push(current);
            }
            current = '';
          }
        }
        if (current.length >= 3) readable.push(current);
        rawText = readable.join(' ');
      } catch (e: any) {
        rawText = `Error decoding: ${e.message}`;
      }

      // Check for "consider" in various forms
      const considerMatches: string[] = [];
      const lowerText = rawText.toLowerCase();
      const patterns = ['consider', 'eligible', 'clear', 'alert', 'review', 'adverse', 'dispute'];
      for (const pattern of patterns) {
        const idx = lowerText.indexOf(pattern);
        if (idx !== -1) {
          // Get surrounding context (50 chars before and after)
          const start = Math.max(0, idx - 50);
          const end = Math.min(rawText.length, idx + pattern.length + 50);
          considerMatches.push(`...${rawText.slice(start, end)}...`);
        }
      }

      attachmentDetails.push({
        id: att.id,
        filename: att.filename || att.name,
        contentType: attData.contentType,
        dataLength: attData.data?.length || 0,
        rawTextLength: rawText.length,
        rawTextSample: rawText.slice(0, 2000),
        considerMatches,
        hasConsider: lowerText.includes('consider'),
      });
    }

    // Step 6: Check email body too
    const bodyText = fullMsg.text || '';
    const bodyHtml = fullMsg.html || '';
    const bodyPlain = bodyHtml ? bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';

    return res.status(200).json({
      account: { id: account.id, email: account.address },
      message: {
        id: bgcMessage.id,
        subject: bgcMessage.subject,
        from: bgcMessage.from,
        date: bgcMessage.createdAt || bgcMessage.date,
      },
      body: {
        text: bodyText.slice(0, 3000),
        htmlStripped: bodyPlain.slice(0, 3000),
        hasConsiderInBody: bodyText.toLowerCase().includes('consider') || bodyPlain.toLowerCase().includes('consider'),
      },
      attachments: attachmentDetails,
      fullMsgKeys: Object.keys(fullMsg),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message, stack: error.stack });
  }
}
