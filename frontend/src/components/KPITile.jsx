import { fmt } from '../theme.js';

const ICONS = {
  currency: (color) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
    </svg>
  ),
  number: (color) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  ),
};

function Skeleton({ theme, width = '100%', height = 32 }) {
  return (
    <div style={{ width, height, background: theme.border, borderRadius: 6, animation: 'kpi-pulse 1.6s ease-in-out infinite' }} />
  );
}

export default function KPITile({ theme, label, value, format, sub, loading }) {
  const iconColor = '#2563eb';
  const iconBg = theme.bg === '#080d1a' ? '#1e3a5f' : '#dbeafe';
  const IconEl = format === 'currency' ? ICONS.currency : ICONS.number;

  return (
    <div style={{
      background: theme.surface,
      border: `1px solid ${theme.border}`,
      borderRadius: 14,
      padding: '20px 22px 18px',
      transition: 'background 0.25s, border-color 0.25s',
    }}>
      {/* Label row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
          color: theme.textMuted,
          fontFamily: "'Space Grotesk', sans-serif",
        }}>
          {label}
        </span>
        <div style={{
          width: 36, height: 36, borderRadius: 9,
          background: iconBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          {IconEl(iconColor)}
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Skeleton theme={theme} width="70%" height={36} />
          <Skeleton theme={theme} width="45%" height={16} />
        </div>
      ) : (
        <>
          <div style={{
            fontSize: 32,
            fontWeight: 700,
            fontFamily: "'Space Grotesk', sans-serif",
            color: theme.textPrimary,
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
            marginBottom: sub ? 8 : 0,
          }}>
            {fmt(value, format)}
          </div>
          {sub && (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 12,
              fontWeight: 500,
              color: '#16a34a',
              background: theme.bg === '#080d1a' ? '#14532d22' : '#dcfce7',
              padding: '3px 8px',
              borderRadius: 20,
            }}>
              <span style={{ fontSize: 10 }}>●</span>
              {sub}
            </div>
          )}
        </>
      )}
    </div>
  );
}
