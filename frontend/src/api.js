export async function fetchDashboard({ client, dateRange, startDate, endDate }) {
  const params = new URLSearchParams({ client, dateRange: String(dateRange) });
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

export async function generateAIBrief(data, clientName) {
  const m = data?.meta?.total || {};
  const g = data?.google?.total || null;

  const topCampaigns = (data?.meta?.campaigns || [])
    .slice(0, 5)
    .map(c => `  • ${c.name}: $${c.spend.toFixed(2)} spend, ${c.leads} leads, ${c.ctr.toFixed(2)}% CTR`)
    .join('\n');

  const prompt = `You are a performance marketing analyst. Provide a concise brief for ${clientName}.

META: Spend $${m.spend?.toFixed(2) ?? 0}, Impressions ${(m.impressions ?? 0).toLocaleString()}, Clicks ${m.clicks ?? 0}, CTR ${m.ctr?.toFixed(2) ?? 0}%, Leads ${m.leads ?? 0}, CPL $${m.cpl?.toFixed(2) ?? 0}, CPM $${m.cpm?.toFixed(2) ?? 0}
${g ? `GOOGLE: Spend $${g.spend?.toFixed(2)}, Impressions ${g.impressions?.toLocaleString()}, Clicks ${g.clicks}, CTR ${g.ctr?.toFixed(2)}%, Conversions ${g.conversions}, CPL $${g.cpl?.toFixed(2)}` : ''}

Top campaigns by spend:
${topCampaigns || '  No campaign data'}

Respond with EXACTLY this format (keep each section to 2-3 bullets):

**Act Today**
• [urgent action 1]
• [urgent action 2]

**Watch**
• [metric or trend to monitor 1]
• [metric or trend to monitor 2]

**Healthy**
• [what's performing well 1]
• [what's performing well 2]

Be specific and reference actual numbers.`;

  return callAnthropic(prompt, 800);
}

export async function generateSummary(data, clientName, sections, tone) {
  const m = data?.meta?.total || {};
  const g = data?.google?.total || null;

  const toneDesc = {
    executive: 'Concise executive style. Focus on ROI, business impact, key decisions. Use bullet points.',
    technical: 'Detailed technical analyst style. Include specific metrics, statistical observations, benchmark comparisons.',
    'client-friendly': 'Friendly, jargon-free style. Celebrate wins, explain clearly, suggest clear next steps.',
  }[tone] || 'professional and clear';

  const campLines = (data?.meta?.campaigns || [])
    .slice(0, 8)
    .map(c => `  • ${c.name}: $${c.spend.toFixed(2)} spend | ${c.leads} leads | ${c.ctr.toFixed(2)}% CTR | $${c.cpl.toFixed(2)} CPL`)
    .join('\n');

  const prompt = `You are a performance marketing analyst writing a ${tone} report for ${clientName}.
Tone: ${toneDesc}

DATA SUMMARY:
Meta — Spend: $${m.spend?.toFixed(2) ?? 0}, Impressions: ${(m.impressions ?? 0).toLocaleString()}, Clicks: ${m.clicks ?? 0}, CTR: ${m.ctr?.toFixed(2) ?? 0}%, Leads: ${m.leads ?? 0}, CPL: $${m.cpl?.toFixed(2) ?? 0}, CPM: $${m.cpm?.toFixed(2) ?? 0}
${g ? `Google — Spend: $${g.spend?.toFixed(2)}, Impressions: ${g.impressions?.toLocaleString()}, Clicks: ${g.clicks}, CTR: ${g.ctr?.toFixed(2)}%, Conversions: ${g.conversions}, CPL: $${g.cpl?.toFixed(2)}` : 'Google: No data'}

Campaign breakdown:
${campLines || '  No campaign data'}

Write a report covering these sections: ${sections.join(', ')}.
Use ## for section headers. Keep each section focused and actionable. Use markdown formatting.`;

  return callAnthropic(prompt, 2000);
}
