const TMR_BASE = process.env.TMR_BASE_URL || 'https://api.twominutereports.com/v1';

export const OATSIDE = {
  teamId: process.env.TMR_TEAM_ID || '019d0ca3-ce95-7387-a650-5e055605107a',
  accounts: {
    tiktok: '7216573742091091970',
    meta: 'act_764971328270854',
    google: '3685435931',
  },
};

export function getDateRange(days) {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() - days + 1));
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

export async function queryTMR(apiKey, teamId, connectors) {
  const res = await fetch(`${TMR_BASE}/teams/${teamId}/data/run-query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ connectors }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[TMR] ${res.status} from ${TMR_BASE}/teams/${teamId}/data/run-query:`, body.slice(0, 500));
    let msg = `TMR API ${res.status}`;
    try {
      const e = JSON.parse(body);
      const errField = e.error;
      msg = e.message
        || (typeof errField === 'string' ? errField : errField?.message || JSON.stringify(errField))
        || msg;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export function parseConnectorResult(connectorResult) {
  const result = connectorResult?.results?.[0];
  if (!result) return { campaigns: [], total: {} };

  const { data, totals, meta } = result;
  const fields = [...(meta?.dimensions || []), ...(meta?.metrics || [])];

  const campaigns = (data?.rows || [])
    .map(row => {
      const obj = {};
      fields.forEach((f, i) => { obj[f] = row[i] ?? null; });
      return obj;
    })
    .filter(c => c.campaign_name && parseFloat(c.spend || 0) > 0)
    .sort((a, b) => (parseFloat(b.spend) || 0) - (parseFloat(a.spend) || 0));

  return { campaigns, total: totals || {} };
}
