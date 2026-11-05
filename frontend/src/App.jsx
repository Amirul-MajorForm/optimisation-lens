import { useState, useEffect, useCallback, useRef } from 'react';
import { DARK, LIGHT } from './theme.js';
import { fetchDashboard, fetchCommerce, fetchGoals } from './api.js';
import { resolvePreset } from './dateRanges.js';
import Header from './components/Header.jsx';
import CampaignTable from './components/CampaignTable.jsx';
import CommerceLens from './components/CommerceLens.jsx';
import GoalTracker from './components/GoalTracker.jsx';
import Sidebar from './components/Sidebar.jsx';

const MARKET_CODES = (...sources) => Object.assign({}, ...sources.map(s => s?.markets || {}));

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
  const [activeTab, setActiveTab] = useState('brand');
  // Commerce Lens data is only fetched once the tab is opened
  const [commerce, setCommerce] = useState(null); // { params, data }
  const [commerceLoading, setCommerceLoading] = useState(false);
  const [commerceError, setCommerceError] = useState(null);
  // Goal tracking (Brand Lens) — loaded per date range, after/alongside brand data
  const [goals, setGoals] = useState(null); // { params, data }
  const [goalsLoading, setGoalsLoading] = useState(false);
  const [goalsError, setGoalsError] = useState(null);

  const theme = darkMode ? DARK : LIGHT;

  function computeDateLabel(params) {
    if (params.startDate && params.endDate) {
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
    if (val === 'custom') return;
    const preset = resolvePreset(val);
    setFetchParams(preset ? { dateRange: val, ...preset } : { dateRange: val, startDate: '', endDate: '' });
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

  const commerceAbortRef = useRef(null);

  const loadCommerce = useCallback(async () => {
    if (commerceAbortRef.current) commerceAbortRef.current.abort();
    const controller = new AbortController();
    commerceAbortRef.current = controller;

    setCommerceLoading(true);
    setCommerceError(null);
    try {
      const result = await fetchCommerce(fetchParams, controller.signal);
      setCommerce({ params: fetchParams, data: result });
    } catch (e) {
      if (e.name !== 'AbortError') setCommerceError(e.message);
    } finally {
      if (commerceAbortRef.current === controller) setCommerceLoading(false);
    }
  }, [fetchParams]);

  // Fetch commerce data when the tab is open and we don't have it for this date range yet
  useEffect(() => {
    if (activeTab === 'commerce' && commerce?.params !== fetchParams) loadCommerce();
  }, [activeTab, fetchParams, commerce, loadCommerce]);

  const goalsAbortRef = useRef(null);

  const loadGoals = useCallback(async () => {
    if (goalsAbortRef.current) goalsAbortRef.current.abort();
    const controller = new AbortController();
    goalsAbortRef.current = controller;

    setGoalsLoading(true);
    setGoalsError(null);
    try {
      const result = await fetchGoals(fetchParams, controller.signal);
      setGoals({ params: fetchParams, data: result });
    } catch (e) {
      if (e.name !== 'AbortError') setGoalsError(e.message);
    } finally {
      if (goalsAbortRef.current === controller) setGoalsLoading(false);
    }
  }, [fetchParams]);

  useEffect(() => {
    if (activeTab === 'brand' && goals?.params !== fetchParams) loadGoals();
  }, [activeTab, fetchParams, goals, loadGoals]);

  const handleRefresh = () => {
    load();
    if (activeTab === 'brand') loadGoals();
    if (activeTab === 'commerce') loadCommerce();
  };

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
        // Markets with at least one campaign in the current pull (ID/TH only show when present)
        const commerceData = commerce?.params === fetchParams ? commerce.data : null;
        const hasBrand = m => ['tiktok', 'meta', 'google'].some(p => m?.[p]?.campaigns?.length > 0);
        const hasCommerceCampaigns = m => ['tiktok', 'meta', 'google'].some(p => m?.commerceCampaigns?.[p]?.campaigns?.length > 0);
        const activeMarkets = new Set(
          Object.keys(MARKET_CODES(data, commerceData)).filter(code => activeTab === 'commerce'
            ? (commerceData?.markets?.[code]?.cpas?.length > 0 || hasCommerceCampaigns(data?.markets?.[code]))
            : hasBrand(data?.markets?.[code]))
        );
        const isCommerce = activeTab === 'commerce';
        const shownError = isCommerce ? (commerceError || error) : error;
        return (
          <>
            <Header
              theme={theme}
              darkMode={darkMode}
              market={market}
              onMarketChange={handleMarketChange}
              marketName={marketName}
              activeMarkets={activeMarkets}
              dateRange={dateRange}
              onDateRangeChange={handleDateRangeChange}
              customStart={customStart}
              customEnd={customEnd}
              onCustomStartChange={setCustomStart}
              onCustomEndChange={setCustomEnd}
              onApplyCustom={handleApplyCustom}
              dateLabel={dateLabel}
              onRefresh={handleRefresh}
              refreshing={isCommerce ? (loading || commerceLoading) : loading}
            />

            <main style={{ flex: 1, overflowY: 'auto', padding: '28px 32px 64px' }}>
              {shownError && (
                <div style={{
                  background: darkMode ? '#3b0a0a' : '#fee2e2',
                  color: darkMode ? '#fca5a5' : '#991b1b',
                  border: `1px solid ${darkMode ? '#7f1d1d' : '#fecaca'}`,
                  padding: '12px 16px', borderRadius: 10, marginBottom: 20, fontSize: 14,
                }}>
                  {shownError}
                </div>
              )}

              {activeTab === 'brand' && (
                <>
                  <GoalTracker
                    theme={theme}
                    darkMode={darkMode}
                    goals={goals?.params === fetchParams ? goals.data?.markets?.[market] : null}
                    loading={goalsLoading}
                    error={goalsError}
                    previousRange={goals?.data?.previousRange}
                    previousError={goals?.data?.previousError}
                  />
                  <CampaignTable theme={theme} data={marketData} loading={loading} />
                </>
              )}

              {isCommerce && (
                <CommerceLens
                  theme={theme}
                  commerce={commerceData?.markets?.[market]}
                  campaigns={marketData?.commerceCampaigns}
                  loading={commerceLoading || loading}
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
