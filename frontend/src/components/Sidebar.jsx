const TABS = [
  {
    id: 'overview',
    label: 'Campaign Analysis',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="8" width="3" height="7" rx="1" fill="currentColor" opacity="0.7"/>
        <rect x="6" y="5" width="3" height="10" rx="1" fill="currentColor"/>
        <rect x="11" y="2" width="3" height="13" rx="1" fill="currentColor" opacity="0.7"/>
      </svg>
    ),
  },
  {
    id: 'search',
    label: 'Search Analysis',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M10 10l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
];

export default function Sidebar({ theme, activeTab, onTabChange }) {
  return (
    <div style={{
      width: 200,
      flexShrink: 0,
      position: 'sticky',
      top: 60,
      height: 'calc(100vh - 60px)',
      borderRight: `1px solid ${theme.border}`,
      padding: '16px 10px',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: theme.textMuted,
        fontFamily: "'Space Grotesk', sans-serif",
        padding: '0 8px',
        marginBottom: 8,
      }}>
        Views
      </div>
      {TABS.map(tab => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              padding: '8px 10px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              background: isActive ? theme.accentLight : 'transparent',
              color: isActive ? theme.accent : theme.textSecondary,
              textAlign: 'left',
              fontSize: 13,
              fontWeight: isActive ? 600 : 400,
              fontFamily: "'DM Sans', sans-serif",
              transition: 'background 0.1s, color 0.1s',
            }}
            onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = theme.surfaceAlt; }}
            onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
          >
            <span style={{ flexShrink: 0 }}>{tab.icon}</span>
            <span style={{ lineHeight: 1.3 }}>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
