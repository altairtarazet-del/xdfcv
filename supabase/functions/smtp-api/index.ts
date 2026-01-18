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

    const { action, mailboxId, filters } = await req.json();

    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    let result;

    switch (action) {
      case 'getMailboxes': {
        const response = await fetch(`${SMTP_API_URL}/mailboxes`, { headers });
        const data = await response.json();
        result = { mailboxes: data.data || data };
        break;
      }

      case 'getMessages': {
        if (!mailboxId) throw new Error('mailboxId required');
        
        const response = await fetch(`${SMTP_API_URL}/mailboxes/${mailboxId}/messages`, { headers });
        const data = await response.json();
        let messages = data.data || data || [];

        // Apply filters
        if (filters) {
          const now = new Date();

          if (filters.timeFilterMinutes) {
            const cutoff = new Date(now.getTime() - filters.timeFilterMinutes * 60000);
            messages = messages.filter((m: any) => new Date(m.date) >= cutoff);
          }

          if (filters.allowedSenders?.length) {
            messages = messages.filter((m: any) => 
              filters.allowedSenders.some((s: string) => 
                s.startsWith('*@') 
                  ? m.from.address.endsWith(s.slice(1))
                  : m.from.address === s
              )
            );
          }

          if (filters.allowedReceivers?.length) {
            messages = messages.filter((m: any) =>
              m.to.some((t: any) => filters.allowedReceivers.includes(t.address))
            );
          }
        }

        result = { messages };
        break;
      }

      case 'getMessage': {
        if (!mailboxId) throw new Error('mailboxId required');
        const { messageId } = await req.json();
        if (!messageId) throw new Error('messageId required');

        const response = await fetch(`${SMTP_API_URL}/mailboxes/${mailboxId}/messages/${messageId}`, { headers });
        result = await response.json();
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
