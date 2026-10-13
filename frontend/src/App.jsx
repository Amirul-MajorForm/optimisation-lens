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
import Sidebar from './components/Sidebar.jsx';
import SearchAnalysis from './components/SearchAnalysis.jsx';

export const CLIENT_NAMES = {
  'ym-sg': 'Yoga Movement SG',
  'ym-academy': 'Yoga Movement Academy',
  'ym-hk': 'Yoga Movement HK',
  'strong': 'Strong',
};

export default function App() {
  const [darkMode, setDarkMode] = useState(false);
  const [client, setClient] = useState('ym-sg');
  // UI state for the date controls
  const [dateRange, setDateRange] = useState('7');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  // Committed params that actually drive the fetch — custom only updates on Apply
  const [fetchParams, setFetchParams] = useState({ dateRange: '7', startDate: '', endDate: '' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [conversionCol, setConversionCol] = useState(() => {
    try { return localStorage.getItem(`conv-col-${client}`) || ''; } catch { return ''; }
  });
  const [metaConversionCol, setMetaConversionCol] = useState(() => {
    try { return localStorage.getItem(`meta-conv-col-${client}`) || ''; } catch { return ''; }
  });

  const theme = darkMode ? DARK : LIGHT;

  function computeDateLabel(params) {
    if (params.dateRange === 'custom' && params.startDate && params.endDate) {
      return `${fmtDateStr(params.startDate)} – ${fmtDateStr(params.endDate)}`;
    }
    const days = parseInt(params.dateRange);
    if (!days) return '';
    const now = new Date();
    const endUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
    const startUTC = new Date(Date.UTC(endUTC.getUTCFullYear(), endUTC.getUTCMonth(), endUTC.getUTCDate() - days + 1));
    return `${fmtDate(startUTC)} – ${fmtDate(endUTC)}`;
  }

  function fmtDate(d) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  }

  function fmtDateStr(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  }

  const dateLabel = computeDateLabel(fetchParams);

  const handleDateRangeChange = (val) => {
    setDateRange(val);
    if (val !== 'custom') setFetchParams({ dateRange: val, startDate: '', endDate: '' });
  };

  const handleConversionColChange = (val) => {
    setConversionCol(val);
    try { localStorage.setItem(`conv-col-${client}`, val); } catch {}
  };

  const handleMetaConversionColChange = (val) => {
    setMetaConversionCol(val);
    try { localStorage.setItem(`meta-conv-col-${client}`, val); } catch {}
  };

  const handleApplyCustom = () => {
    if (customStart && customEnd && customStart <= customEnd) {
      setFetchParams({ dateRange: 'custom', startDate: customStart, endDate: customEnd });
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchDashboard({
        client, ...fetchParams,
        conversionCol: conversionCol || undefined,
        metaConversionCol: metaConversionCol || undefined,
      });
      setData(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [client, fetchParams, conversionCol, metaConversionCol]);

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
      label: 'Performance & Platform Metrics',
      render: () => (
        <div style={{ display: 'grid', gridTemplateColumns: showGoogle ? '1fr 1fr' : '1fr', gap: 16, alignItems: 'stretch' }}>
          <PerformanceChart
            theme={theme}
            metaByDate={meta?.byDate}
            googleByDate={google?.byDate}
            showGoogle={showGoogle}
            dateRange={fetchParams.dateRange === 'custom' ? 0 : parseInt(fetchParams.dateRange)}
            startDate={fetchParams.startDate}
            endDate={fetchParams.endDate}
            loading={loading}
          />
          {(meta || showGoogle) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {meta && <PlatformTile theme={theme} platform="Meta" data={meta.total} loading={loading} />}
              {showGoogle && google && (
                <PlatformTile theme={theme} platform="Google" data={google.total} loading={loading} />
              )}
            </div>
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
          client={client}
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
      display: 'flex',
      height: '100vh',
      overflow: 'hidden',
      fontFamily: "'DM Sans', sans-serif",
      color: theme.textPrimary,
      transition: 'background 0.25s, color 0.25s',
    }}>
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        darkMode={darkMode}
        onToggleDark={() => setDarkMode(d => !d)}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: theme.bg }}>
        <Header
          theme={theme}
          darkMode={darkMode}
          client={client}
          onClientChange={setClient}
          dateRange={dateRange}
          onDateRangeChange={handleDateRangeChange}
          customStart={customStart}
          customEnd={customEnd}
          onCustomStartChange={setCustomStart}
          onCustomEndChange={setCustomEnd}
          onApplyCustom={handleApplyCustom}
          dateLabel={dateLabel}
          onRefresh={load}
          refreshing={loading}
          activeTab={activeTab}
          availableConversions={data?.availableConversions || []}
          selectedConversion={conversionCol || data?.selectedConversion || ''}
          onConversionColChange={handleConversionColChange}
          availableMetaConversions={data?.availableMetaConversions || []}
          selectedMetaConversion={metaConversionCol || data?.selectedMetaConversion || ''}
          onMetaConversionColChange={handleMetaConversionColChange}
        />

        <main style={{ flex: 1, overflowY: 'auto', padding: '28px 32px 64px' }}>
          {activeTab === 'overview' && (
            <>
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
            </>
          )}

          {activeTab === 'search' && (
            <SearchAnalysis theme={theme} client={client} fetchParams={fetchParams} />
          )}
        </main>
      </div>
    </div>
  );
}
