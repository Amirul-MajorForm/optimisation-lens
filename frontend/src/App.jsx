import { useState, useEffect, useCallback, useRef } from 'react';
import { DARK, LIGHT } from './theme.js';
import { fetchDashboard, generateAIBrief, fetchStyleRef } from './api.js';
import Header from './components/Header.jsx';
import CampaignTable from './components/CampaignTable.jsx';
import Sidebar from './components/Sidebar.jsx';
import AIBrief from './components/AIBrief.jsx';

export default function App() {
  const [darkMode, setDarkMode] = useState(false);
  const [market, setMarket] = useState('sg');
  const [dateRange, setDateRange] = useState('7');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [fetchParams, setFetchParams] = useState({ dateRange: '7', startDate: '', endDate: '' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

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

  const handleMarketChange = (val) => {
    setMarket(val);
    // No fetch — market switching is client-side filtering
  };

  const handleDateRangeChange = (val) => {
    setDateRange(val);
    if (val !== 'custom') setFetchParams({ dateRange: val, startDate: '', endDate: '' });
  };

  const handleApplyCustom = () => {
    if (customStart && customEnd && customStart <= customEnd) {
      setFetchParams({ dateRange: 'custom', startDate: customStart, endDate: customEnd });
    }
  };

  const abortRef = useRef(null);

  const load = useCallback(async () => {
    // Cancel any in-flight request before starting a new one
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const result = await fetchDashboard(fetchParams, controller.signal);
      setData(result);
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [fetchParams]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      overflow: 'hidden',
      fontFamily: "'DM Sans', sans-serif",
      color: theme.textPrimary,
      transition: 'background 0.25s, color 0.25s',
    }}>
      <style>{`
        @keyframes kpi-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        darkMode={darkMode}
        onToggleDark={() => setDarkMode(d => !d)}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: theme.bg }}>
        {/* Derive the current market's slice from the full all-markets response */}
      {(() => {
        const marketData = data?.markets?.[market] ?? null;
        const marketName = data?.markets?.[market]?.marketName || '';
        return (
          <>
            <Header
              theme={theme}
              darkMode={darkMode}
              market={market}
              onMarketChange={handleMarketChange}
              marketName={marketName}
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
            />

            <main style={{ flex: 1, overflowY: 'auto', padding: '28px 32px 64px' }}>
              {error && (
                <div style={{
                  background: darkMode ? '#3b0a0a' : '#fee2e2',
                  color: darkMode ? '#fca5a5' : '#991b1b',
                  border: `1px solid ${darkMode ? '#7f1d1d' : '#fecaca'}`,
                  padding: '12px 16px', borderRadius: 10, marginBottom: 20, fontSize: 14,
                }}>
                  {error}
                </div>
              )}

              {activeTab === 'overview' && (
                <CampaignTable theme={theme} data={marketData} loading={loading} />
              )}

              {activeTab === 'search' && (
                <AIBrief
                  theme={theme}
                  data={marketData}
                  clientName={marketName || 'OATSIDE'}
                  loading={loading}
                />
              )}
            </main>
          </>
        );
      })()}
      </div>
    </div>
  );
}
