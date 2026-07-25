const CLIENTS = [
  { value: 'ym-sg', label: 'Yoga Movement SG' },
  { value: 'ym-academy', label: 'Yoga Movement Academy' },
  { value: 'ym-hk', label: 'Yoga Movement HK' },
  { value: 'strong', label: 'Strong' },
];

const DATE_RANGES = [
  { value: '7', label: 'Last 7 days' },
  { value: '14', label: 'Last 14 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '60', label: 'Last 60 days' },
  { value: '90', label: 'Last 90 days' },
  { value: 'custom', label: 'Custom range…' },
];

const CHEVRON_SVG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2394a3b8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`;

export default function Header({
  theme, darkMode, onToggleDark,
  client, onClientChange,
  dateRange, onDateRangeChange,
  customStart, customEnd, onCustomStartChange, onCustomEndChange, onApplyCustom,
}) {
  const sel = {
    background: theme.surface,
    color: theme.textPrimary,
    border: `1px solid ${theme.border}`,
    borderRadius: 8,
    padding: '7px 32px 7px 12px',
    fontSize: 14,
    fontFamily: "'DM Sans', sans-serif",
    cursor: 'pointer',
    outline: 'none',
    appearance: 'none',
    WebkitAppearance: 'none',
    backgroundImage: CHEVRON_SVG,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 10px center',
    minWidth: 150,
    transition: 'border-color 0.15s',
  };

  return (
    <header style={{
      background: theme.surface,
      borderBottom: `1px solid ${theme.border}`,
      padding: '0 24px',
      position: 'sticky',
      top: 0,
      zIndex: 200,
      backdropFilter: 'blur(8px)',
    }}>
      <div style={{
        maxWidth: 1400,
        margin: '0 auto',
        height: 60,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 'auto' }}>
          <div style={{
            width: 30, height: 30,
            background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
            borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 8l6-6 6 6M3.5 7v6h9V7" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 700, fontSize: 17,
            color: theme.textPrimary,
            letterSpacing: '-0.01em',
          }}>
            Optimisation Lens
          </span>
        </div>

        {/* Client */}
        <select value={client} onChange={e => onClientChange(e.target.value)} style={sel}>
          {CLIENTS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>

        {/* Date range */}
        <select value={dateRange} onChange={e => onDateRangeChange(e.target.value)} style={sel}>
          {DATE_RANGES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>

        {/* Custom date inputs */}
        {dateRange === 'custom' && (
          <>
            <input
              type="date"
              value={customStart}
              onChange={e => onCustomStartChange(e.target.value)}
              max={customEnd || undefined}
              style={{
                ...sel,
                minWidth: 130,
                padding: '7px 10px',
                backgroundImage: 'none',
                colorScheme: darkMode ? 'dark' : 'light',
              }}
            />
            <span style={{ color: theme.textMuted, fontSize: 13, flexShrink: 0 }}>→</span>
            <input
              type="date"
              value={customEnd}
              onChange={e => onCustomEndChange(e.target.value)}
              min={customStart || undefined}
              style={{
                ...sel,
                minWidth: 130,
                padding: '7px 10px',
                backgroundImage: 'none',
                colorScheme: darkMode ? 'dark' : 'light',
              }}
            />
            <button
              onClick={onApplyCustom}
              disabled={!customStart || !customEnd || customStart > customEnd}
              style={{
                background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '7px 14px',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
                cursor: !customStart || !customEnd || customStart > customEnd ? 'not-allowed' : 'pointer',
                opacity: !customStart || !customEnd || customStart > customEnd ? 0.5 : 1,
                flexShrink: 0,
                transition: 'opacity 0.15s',
              }}
            >
              Apply
            </button>
          </>
        )}

        {/* Dark mode toggle */}
        <button
          onClick={onToggleDark}
          title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{
            background: theme.surfaceAlt,
            border: `1px solid ${theme.border}`,
            borderRadius: 8,
            padding: '7px 10px',
            cursor: 'pointer',
            color: theme.textSecondary,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, lineHeight: 1,
            flexShrink: 0,
            transition: 'background 0.15s',
          }}
        >
          {darkMode ? '☀️' : '🌙'}
        </button>
      </div>
    </header>
  );
}
