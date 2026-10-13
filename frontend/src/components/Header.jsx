const CLIENTS = [
  { value: 'ym-sg', label: 'Yoga Movement SG' },
  { value: 'ym-academy', label: 'Yoga Movement Academy' },
  { value: 'ym-hk', label: 'Yoga Movement HK' },
  { value: 'strong', label: 'Strong' },
];

const DATE_RANGES = [
  { value: '7',  label: 'Last 7 days' },
  { value: '14', label: 'Last 14 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '60', label: 'Last 60 days' },
  { value: '90', label: 'Last 90 days' },
  { value: 'custom', label: 'Custom range…' },
];

const TAB_TITLES = {
  overview: 'Campaign Analysis',
  search: 'Search Analysis',
};

export default function Header({
  theme, darkMode,
  client, onClientChange,
  dateRange, onDateRangeChange,
  customStart, customEnd, onCustomStartChange, onCustomEndChange, onApplyCustom,
  dateLabel, onRefresh, refreshing, activeTab,
  availableConversions, selectedConversion, onConversionColChange,
}) {
  const sel = {
    background: theme.surface,
    color: theme.textPrimary,
    border: `1px solid ${theme.border}`,
    borderRadius: 8,
    padding: '6px 30px 6px 11px',
    fontSize: 13,
    fontFamily: "'DM Sans', sans-serif",
    cursor: 'pointer',
    outline: 'none',
    appearance: 'none',
    WebkitAppearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2394a3b8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 9px center',
    transition: 'border-color 0.15s',
  };

  const dateInput = {
    ...sel,
    minWidth: 120,
    padding: '6px 10px',
    backgroundImage: 'none',
    colorScheme: darkMode ? 'dark' : 'light',
  };

  return (
    <header style={{
      background: theme.surface,
      borderBottom: `1px solid ${theme.border}`,
      padding: '0 28px',
      height: 64,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flexShrink: 0,
      transition: 'background 0.25s',
    }}>
      {/* Page title */}
      <div style={{ marginRight: 'auto' }}>
        <div style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontWeight: 700,
          fontSize: 18,
          color: theme.textPrimary,
          lineHeight: 1.2,
        }}>
          {TAB_TITLES[activeTab] || 'Dashboard'}
        </div>
      </div>

      {/* Client selector */}
      <select value={client} onChange={e => onClientChange(e.target.value)} style={sel}>
        {CLIENTS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
      </select>

      {/* Date range */}
      <select value={dateRange} onChange={e => onDateRangeChange(e.target.value)} style={sel}>
        {DATE_RANGES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
      </select>
      {dateLabel && (
        <span style={{ fontSize: 12, color: theme.textMuted, whiteSpace: 'nowrap', flexShrink: 0 }}>{dateLabel}</span>
      )}

      {/* Custom date inputs */}
      {dateRange === 'custom' && (
        <>
          <input type="date" value={customStart} onChange={e => onCustomStartChange(e.target.value)} max={customEnd || undefined} style={dateInput} />
          <span style={{ color: theme.textMuted, fontSize: 12, flexShrink: 0 }}>→</span>
          <input type="date" value={customEnd} onChange={e => onCustomEndChange(e.target.value)} min={customStart || undefined} style={dateInput} />
          <button
            onClick={onApplyCustom}
            disabled={!customStart || !customEnd || customStart > customEnd}
            style={{
              background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
              color: '#fff', border: 'none', borderRadius: 8,
              padding: '7px 14px', fontSize: 13, fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
              cursor: !customStart || !customEnd || customStart > customEnd ? 'not-allowed' : 'pointer',
              opacity: !customStart || !customEnd || customStart > customEnd ? 0.5 : 1,
              flexShrink: 0, transition: 'opacity 0.15s',
            }}
          >
            Apply
          </button>
        </>
      )}

      {/* Conversion column selector */}
      {availableConversions?.length > 0 && (
        <>
          <div style={{ width: 1, height: 20, background: theme.border }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span style={{ fontSize: 12, color: theme.textMuted, whiteSpace: 'nowrap' }}>Conv:</span>
            <select
              value={selectedConversion}
              onChange={e => onConversionColChange(e.target.value)}
              style={{ ...sel, minWidth: 180 }}
            >
              {availableConversions.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
        </>
      )}

      {/* Refresh */}
      <button
        onClick={onRefresh}
        disabled={refreshing}
        title="Refresh data"
        style={{
          background: theme.surfaceAlt,
          border: `1px solid ${theme.border}`,
          borderRadius: 8,
          padding: '7px 9px',
          cursor: refreshing ? 'not-allowed' : 'pointer',
          color: theme.textSecondary,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, opacity: refreshing ? 0.5 : 1,
          transition: 'opacity 0.15s, background 0.15s',
        }}
        onMouseEnter={e => { if (!refreshing) e.currentTarget.style.background = theme.border; }}
        onMouseLeave={e => { e.currentTarget.style.background = theme.surfaceAlt; }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
          style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }}>
          <path d="M4 12a8 8 0 018-8 8 8 0 015.657 2.343L20 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <path d="M20 4v5h-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M20 12a8 8 0 01-8 8 8 8 0 01-5.657-2.343L4 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <path d="M4 20v-5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </header>
  );
}
