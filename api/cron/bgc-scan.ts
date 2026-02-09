import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verify cron secret
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Missing Supabase configuration' });
  }

  const edgeFunctionUrl = `${supabaseUrl}/functions/v1/smtp-api`;

  try {
    // 1. Run BGC Complete scan
    const bgcResponse = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ action: 'scanBgcComplete' }),
    });

    const bgcResult = await bgcResponse.json();

    // 2. Run First Package scan
    const fpResponse = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ action: 'scanFirstPackage' }),
    });

    const fpResult = await fpResponse.json();

    // 3. Recheck existing BGC emails for consider status
    const considerResponse = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ action: 'recheckBgcConsider' }),
    });

    const considerResult = await considerResponse.json();

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      bgcScan: bgcResult,
      firstPackageScan: fpResult,
      considerRecheck: considerResult,
    });
  } catch (error: any) {
    console.error('Cron BGC scan error:', error);
    return res.status(500).json({ error: error.message || 'Cron scan failed' });
  }
}
