// Sidebar colors are always dark-navy regardless of light/dark mode
const S = {
  bg: '#0d1f35',
  hover: '#152a42',
  active: '#1d3659',
  border: '#1a3050',
  text: '#7099be',
  textActive: '#ffffff',
  label: '#3d6080',
  accent: '#3b82f6',
};

// Brand Lens: megaphone (awareness / brand campaigns)
const ICON_BRAND = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1z"/>
    <path d="M16.5 8.5a5 5 0 0 1 0 7"/>
    <path d="M19 6a8.5 8.5 0 0 1 0 12"/>
  </svg>
);

// Commerce Lens: shopping bag (marketplace / sales campaigns)
const ICON_COMMERCE = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
    <path d="M3 6h18"/>
    <path d="M16 10a4 4 0 0 1-8 0"/>
  </svg>
);

const ICON_COLLAPSE = (open) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    style={{ transition: 'transform 0.2s', transform: open ? 'none' : 'rotate(180deg)' }}
  >
    <path d="M15 18l-6-6 6-6"/>
  </svg>
);

const ICON_MOON = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);

const ICON_SUN = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/>
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
  </svg>
);

// Sales Lens: price tag (mega-sale comparison)
const ICON_SALES = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/>
    <circle cx="7.5" cy="7.5" r="1.5"/>
  </svg>
);

const TABS = [
  { id: 'brand',    label: 'Brand Lens',    icon: ICON_BRAND },
  { id: 'commerce', label: 'Commerce Lens', icon: ICON_COMMERCE },
  { id: 'sales',    label: 'Sales Lens',    icon: ICON_SALES },
];

export default function Sidebar({ activeTab, onTabChange, darkMode, onToggleDark }) {
  return (
    <div style={{
      width: 240,
      flexShrink: 0,
      background: S.bg,
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      borderRight: `1px solid ${S.border}`,
    }}>
      {/* Logo */}
      <div style={{
        padding: '20px 20px 16px',
        borderBottom: `1px solid ${S.border}`,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 9,
          background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          {/* MajorView: eye */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/>
            <circle cx="12" cy="12" r="3" fill="white"/>
          </svg>
        </div>
        <span style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontWeight: 700,
          fontSize: 15,
          color: S.textActive,
          letterSpacing: '-0.01em',
        }}>
          MajorView
        </span>
      </div>

      {/* Navigation */}
      <div style={{ flex: 1, padding: '20px 12px', overflowY: 'auto' }}>
        <div style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: S.label,
          padding: '0 8px',
          marginBottom: 8,
          fontFamily: "'Space Grotesk', sans-serif",
        }}>
          Main Menu
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
                gap: 11,
                padding: '10px 12px',
                borderRadius: 9,
                border: 'none',
                cursor: 'pointer',
                background: isActive ? S.active : 'transparent',
                color: isActive ? S.textActive : S.text,
                textAlign: 'left',
                fontSize: 13.5,
                fontWeight: isActive ? 600 : 400,
                fontFamily: "'DM Sans', sans-serif",
                marginBottom: 2,
                transition: 'background 0.12s, color 0.12s',
              }}
              onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = S.hover; e.currentTarget.style.color = '#b8d4ee'; } }}
              onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = S.text; } }}
            >
              {/* Active indicator bar */}
              <span style={{
                position: 'absolute',
                left: 12,
                width: 3,
                height: 22,
                borderRadius: 2,
                background: isActive ? S.accent : 'transparent',
                marginLeft: -12,
                transition: 'background 0.12s',
              }} />
              <span style={{ flexShrink: 0, opacity: isActive ? 1 : 0.7 }}>{tab.icon}</span>
              <span>{tab.label}</span>
              {isActive && (
                <span style={{
                  marginLeft: 'auto',
                  width: 6, height: 6,
                  borderRadius: '50%',
                  background: S.accent,
                  flexShrink: 0,
                }} />
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom: dark mode + user */}
      <div style={{
        padding: '14px 12px',
        borderTop: `1px solid ${S.border}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}>
        <button
          onClick={onToggleDark}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 11,
            padding: '10px 12px',
            borderRadius: 9,
            border: 'none',
            cursor: 'pointer',
            background: 'transparent',
            color: S.text,
            textAlign: 'left',
            fontSize: 13.5,
            fontFamily: "'DM Sans', sans-serif",
            transition: 'background 0.12s, color 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = S.hover; e.currentTarget.style.color = '#b8d4ee'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = S.text; }}
        >
          <span style={{ flexShrink: 0, opacity: 0.7 }}>{darkMode ? ICON_SUN : ICON_MOON}</span>
          <span>{darkMode ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
      </div>
    </div>
  );
}
