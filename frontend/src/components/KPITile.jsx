import { fmt } from '../theme.js';

const PULSE = `
  @keyframes kpi-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
`;

function Skeleton({ theme, width = 100, height = 32 }) {
  return (
    <div style={{
      width, height,
      background: theme.border,
      borderRadius: 6,
      animation: 'kpi-pulse 1.6s ease-in-out infinite',
    }} />
  );
}

export default function KPITile({ theme, label, value, format, sub, loading }) {
  return (
    <div style={{
      background: theme.surface,
      border: `1px solid ${theme.border}`,
      borderRadius: 14,
      padding: '22px 24px 20px',
      position: 'relative',
      overflow: 'hidden',
      transition: 'background 0.25s, border-color 0.25s',
    }}>
      <style>{PULSE}</style>

      {/* Subtle top accent */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: 'linear-gradient(90deg, #2563eb 0%, #7c3aed 100%)',
        borderRadius: '14px 14px 0 0',
      }} />

      <div style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.07em',
        textTransform: 'uppercase',
        color: theme.textMuted,
        marginBottom: 10,
        fontFamily: "'Space Grotesk', sans-serif",
      }}>
        {label}
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Skeleton theme={theme} width={130} height={34} />
          <Skeleton theme={theme} width={80} height={16} />
        </div>
      ) : (
        <>
          <div style={{
            fontSize: 34,
            fontWeight: 700,
            fontFamily: "'Space Grotesk', sans-serif",
            color: theme.textPrimary,
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
          }}>
            {fmt(value, format)}
          </div>
          {sub && (
            <div style={{
              fontSize: 13,
              color: theme.textSecondary,
              marginTop: 6,
              fontWeight: 500,
            }}>
              {sub}
            </div>
          )}
        </>
      )}
    </div>
  );
}
