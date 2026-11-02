export async function fetchDashboard({ dateRange, startDate, endDate, market = 'sg' }) {
  const params = new URLSearchParams({ dateRange: String(dateRange), market });
  if (dateRange === 'custom' && startDate && endDate) {
    params.set('startDate', startDate);
    params.set('endDate', endDate);
  }
  const res = await fetch(`/api/dashboard?${params}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function callAnthropic(prompt, maxTokens = 1024) {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, maxTokens }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `AI error ${res.status}`);
  }
  const json = await res.json();
  return json.text;
}

export async function fetchStyleRef(client) {
  const res = await fetch(`/api/style-ref?client=${encodeURIComponent(client)}`);
  if (!res.ok) return '';
  const json = await res.json();
  return json.text || '';
}

export async function saveStyleRef(client, text) {
  await fetch('/api/style-ref', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client, text }),
  });
}

export async function generateAIBrief(data, clientName = 'OATSIDE', styleRef = '') {
  const tt = data?.tiktok?.total || {};
  const me = data?.meta?.total || {};
  const go = data?.google?.total || {};

  const fmtCampaigns = (campaigns = [], platform) =>
    (campaigns || []).slice(0, 5)
      .map(c => `  • [${platform}] ${c.campaign_name}: $${Number(c.spend || 0).toFixed(2)} spend`)
      .join('\n');

  const styleSection = styleRef?.trim()
    ? `\nMatch the tone and style of this example exactly — don't copy numbers, only style:\n\n${styleRef.trim()}\n`
    : '';

  const prompt = `You are a performance marketing analyst for ${clientName}.
${styleSection}
DATA:
TikTok — Spend $${Number(tt.spend || 0).toFixed(2)}, Impressions ${Number(tt.impressions || 0).toLocaleString()}, Video Views ${Number(tt.video_play_actions || 0).toLocaleString()}, Clicks ${tt.clicks || 0}, CTR ${Number(tt.ctr || 0).toFixed(2)}%, CPM $${Number(tt.cpm || 0).toFixed(2)}, Reach ${Number(tt.reach || 0).toLocaleString()}
Meta — Spend $${Number(me.spend || 0).toFixed(2)}, Impressions ${Number(me.impressions || 0).toLocaleString()}, Clicks ${me.clicks || 0}, CTR ${Number(me.ctr || 0).toFixed(2)}%, CPM $${Number(me.cpm || 0).toFixed(2)}, Reach ${Number(me.reach || 0).toLocaleString()}
Google — Spend $${Number(go.spend || 0).toFixed(2)}, Impressions ${Number(go.impressions || 0).toLocaleString()}, Clicks ${go.clicks || 0}, CTR ${Number(go.ctr || 0).toFixed(2)}%, CPM $${Number(go.cpm || 0).toFixed(2)}

Top campaigns:
${fmtCampaigns(data?.tiktok?.campaigns, 'TikTok')}
${fmtCampaigns(data?.meta?.campaigns, 'Meta')}
${fmtCampaigns(data?.google?.campaigns, 'Google')}

Respond with EXACTLY this format (2-3 bullets each):

**Act Today**
• [urgent action]

**Watch**
• [metric or trend to monitor]

**Healthy**
• [what's performing well]

Be specific and reference actual numbers.`;

  return callAnthropic(prompt, 900);
}
