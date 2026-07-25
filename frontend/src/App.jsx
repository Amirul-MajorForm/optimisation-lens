import { useState, useEffect, useCallback } from 'react';
import { DARK, LIGHT } from './theme.js';
import { fetchDashboard } from './api.js';
import Header from './components/Header.jsx';
import KPITile from './components/KPITile.jsx';
import PerformanceChart from './components/PerformanceChart.jsx';
import PlatformTile from './components/PlatformTile.jsx';
import AIBrief from './components/AIBrief.jsx';
import CampaignTable from './components/CampaignTable.jsx';
import ClientSummary from './components/ClientSummary.jsx';
import DraggableLayout from './components/DraggableLayout.jsx';

export const CLIENT_NAMES = {
  'ym-sg': 'Yoga Movement SG',
  'ym-academy': 'Yoga Movement Academy',
  'ym-hk': 'Yoga Movement HK',
  'strong': 'Strong',
};

export default function App() {
  const [darkMode, setDarkMode] = useState(true);
  const [client, setClient] = useState('ym-sg');
  const [dateRange, setDateRange] = useState('7');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const theme = darkMode ? DARK : LIGHT;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchDashboard({ client, dateRange });
      setData(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [client, dateRange]);

  useEffect(() => { load(); }, [load]);

  const meta = data?.meta;
  const google = data?.google;
  const showGoogle = !!google;

  const totalSpend = (meta?.total?.spend || 0) + (showGoogle ? google?.total?.spend || 0 : 0);
  const totalClicks = (meta?.total?.clicks || 0) + (showGoogle ? google?.total?.clicks || 0 : 0);
  const totalImpressions = (meta?.total?.impressions || 0) + (showGoogle ? google?.total?.impressions || 0 : 0);
  const overallCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const totalLeads = (meta?.total?.leads || 0) + (showGoogle ? google?.total?.conversions || 0 : 0);
  const overallCpl = totalLeads > 0 ? totalSpend / totalLeads : 0;

  const sections = [
    {
      id: 'kpis',
      label: 'KPI Overview',
      render: () => (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          <KPITile theme={theme} label="Total Spend" value={totalSpend} format="currency" loading={loading} />
          <KPITile
            theme={theme} label="Total Clicks" value={totalClicks} format="number"
            sub={`CTR ${overallCtr.toFixed(2)}%`} loading={loading}
          />
          <KPITile
            theme={theme} label="Total Leads" value={totalLeads} format="number"
            sub={totalLeads > 0 ? `CPL $${overallCpl.toFixed(2)}` : 'No leads'} loading={loading}
          />
        </div>
      ),
    },
    {
      id: 'chart',
      label: 'Performance Chart',
      render: () => (
        <PerformanceChart
          theme={theme}
          metaByDate={meta?.byDate}
          googleByDate={google?.byDate}
          showGoogle={showGoogle}
          dateRange={parseInt(dateRange)}
          loading={loading}
        />
      ),
    },
    {
      id: 'platforms',
      label: 'Platform Metrics',
      render: () => (
        <div style={{ display: 'grid', gridTemplateColumns: showGoogle ? '1fr 1fr' : '1fr', gap: 16 }}>
          {meta && <PlatformTile theme={theme} platform="Meta" data={meta.total} loading={loading} />}
          {showGoogle && google && (
            <PlatformTile theme={theme} platform="Google" data={google.total} loading={loading} />
          )}
        </div>
      ),
    },
    {
      id: 'aibrief',
      label: 'AI Brief',
      render: () => (
        <AIBrief theme={theme} data={data} clientName={CLIENT_NAMES[client]} loading={loading} />
      ),
    },
    {
      id: 'campaigns',
      label: 'Campaign Breakdown',
      render: () => (
        <CampaignTable
          theme={theme}
          metaCampaigns={meta?.campaigns}
          googleCampaigns={showGoogle ? google?.campaigns : null}
          loading={loading}
        />
      ),
    },
    {
      id: 'summary',
      label: 'Client Summary',
      render: () => (
        <ClientSummary theme={theme} data={data} clientName={CLIENT_NAMES[client]} loading={loading} />
      ),
    },
  ];

  return (
    <div style={{
      minHeight: '100vh',
      background: theme.bg,
      fontFamily: "'DM Sans', sans-serif",
      color: theme.textPrimary,
      transition: 'background 0.25s, color 0.25s',
    }}>
      <Header
        theme={theme}
        darkMode={darkMode}
        onToggleDark={() => setDarkMode(d => !d)}
        client={client}
        onClientChange={setClient}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
      />

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '28px 24px 64px' }}>
        {error && (
          <div style={{
            background: darkMode ? '#3b0a0a' : '#fee2e2',
            color: darkMode ? '#fca5a5' : '#991b1b',
            border: `1px solid ${darkMode ? '#7f1d1d' : '#fecaca'}`,
            padding: '12px 16px', borderRadius: 10, marginBottom: 20, fontSize: 14,
          }}>
            Failed to load data: {error}. Check your API key and network connection.
          </div>
        )}

        <DraggableLayout theme={theme} sections={sections} />
      </div>
    </div>
  );
}
