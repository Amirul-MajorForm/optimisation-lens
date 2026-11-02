const TMR_BASE = process.env.TMR_BASE_URL || 'https://api.twominutereports.com/v1';

export const OATSIDE = {
  teamId: process.env.TMR_TEAM_ID || '019d0ca3-ce95-7387-a650-5e055605107a',
  accounts: {
    tiktok: 'ttads_7216573742091091970',
    meta:   'fads_act_764971328270854',
    google: 'gadw_3685435931',
  },
};

export function getDateRange(days) {
  const now = new Date();
  const end   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() - days + 1));
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

export async function queryTMR(apiKey, teamId, body) {
  const res = await fetch(`${TMR_BASE}/teams/${teamId}/data/run-query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`[TMR] ${res.status}:`, text.slice(0, 600));
    let msg = `TMR API ${res.status}`;
    try { const e = JSON.parse(text); msg = e.error?.message || e.message || msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export function parsePlatformResult(tmrResponse) {
  const rows = (tmrResponse?.data || []).map(row => {
    const out = { ...row };
    if ('amount_spent' in out) { out.spend = out.amount_spent; delete out.amount_spent; }
    // Derive rate metrics per row (TMR doesn't return these at row level)
    const sp  = parseFloat(out.spend) || 0;
    const imp = parseFloat(out.impressions) || 0;
    const cl  = parseFloat(out.clicks) || 0;
    if (!out.ctr || out.ctr === 0) out.ctr = imp > 0 ? (cl / imp) * 100        : 0;
    if (!out.cpm || out.cpm === 0) out.cpm = imp > 0 ? (sp / imp) * 1000       : 0;
    if (!out.cpc || out.cpc === 0) out.cpc = cl  > 0 ?  sp / cl                : 0;
    return out;
  });

  const campaigns = rows
    .filter(r => r.campaign_name && parseFloat(r.spend || 0) > 0)
    .sort((a, b) => (parseFloat(b.spend) || 0) - (parseFloat(a.spend) || 0));

  // Compute totals from rows (additive metrics summed; rates derived)
  const sum = (key) => rows.reduce((s, r) => s + (parseFloat(r[key]) || 0), 0);
  const spendTotal = sum('spend');
  const impTotal   = sum('impressions');
  const clickTotal = sum('clicks');

  const total = {
    spend:              spendTotal,
    impressions:        impTotal,
    clicks:             clickTotal,
    video_play_actions: sum('video_play_actions'),
    reach:              sum('reach'),
    video_views:        sum('video_views'),
    ctr:  impTotal   > 0 ? (clickTotal / impTotal) * 100        : 0,
    cpm:  impTotal   > 0 ? (spendTotal / impTotal) * 1000       : 0,
    cpc:  clickTotal > 0 ?  spendTotal / clickTotal             : 0,
  };

  return { campaigns, total };
}
