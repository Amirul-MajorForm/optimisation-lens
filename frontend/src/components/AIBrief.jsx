import { useState, useEffect, useRef } from 'react';
import { generateAIBrief, fetchStyleRef, saveStyleRef } from '../api.js';

const SECTION_CONFIG = {
  'Act Today': { color: '#ef4444', bg: '#fef2f2', darkBg: '#2d1515', icon: '🚨' },
  'Watch': { color: '#f59e0b', bg: '#fffbeb', darkBg: '#2d2215', icon: '👁️' },
  'Healthy': { color: '#22c55e', bg: '#f0fdf4', darkBg: '#152d1a', icon: '✅' },
};

function parseBrief(text) {
  const sections = [];
  const lines = text.split('\n');
  let current = null;

  for (const line of lines) {
    const headingMatch = line.match(/^\*\*(Act Today|Watch|Healthy)\*\*/);
    if (headingMatch) {
      if (current) sections.push(current);
      current = { title: headingMatch[1], bullets: [] };
    } else if (current && line.trim().startsWith('•')) {
      current.bullets.push(line.trim().replace(/^•\s*/, ''));
    } else if (current && line.trim().startsWith('-')) {
      current.bullets.push(line.trim().replace(/^-\s*/, ''));
    } else if (current && line.trim() && !line.trim().startsWith('**')) {
      current.bullets.push(line.trim());
    }
  }
  if (current) sections.push(current);
  return sections;
}

export default function AIBrief({ theme, data, clientName, loading: dataLoading }) {
  const [brief, setBrief] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [styleRef, setStyleRef] = useState('');
  const [styleOpen, setStyleOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const saveTimer = useRef(null);
  const clientRef = useRef(clientName);

  const isDark = theme.bg.startsWith('#0') || theme.bg.startsWith('#08');

  // Load style ref whenever client changes
  useEffect(() => {
    clientRef.current = clientName;
    fetchStyleRef(clientName).then(text => {
      if (clientRef.current === clientName) setStyleRef(text);
    });
    setBrief(null);
    setError(null);
  }, [clientName]);

  const handleStyleBlur = () => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await saveStyleRef(clientName, styleRef);
      setSaveStatus('Saved');
      setTimeout(() => setSaveStatus(''), 2000);
    }, 300);
  };

  const handleGenerate = async () => {
    if (!data) return;
    setGenerating(true);
    setError(null);
    setBrief(null);
    try {
      const text = await generateAIBrief(data, clientName, styleRef);
      setBrief(parseBrief(text));
    } catch (e) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div style={{
      background: theme.surface,
      border: `1px solid ${theme.border}`,
      borderRadius: 14,
      padding: '20px 24px',
      transition: 'background 0.25s',
    }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 15, color: theme.textPrimary }}>
            AI Brief
          </div>
          <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>
            Act Today · Watch · Healthy
          </div>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating || dataLoading || !data}
          style={{
            background: generating ? theme.surfaceAlt : 'linear-gradient(135deg, #2563eb, #7c3aed)',
            color: generating ? theme.textMuted : '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 600,
            fontFamily: "'DM Sans', sans-serif",
            cursor: generating || dataLoading || !data ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
            transition: 'opacity 0.15s',
            opacity: generating || dataLoading || !data ? 0.6 : 1,
          }}
        >
          {generating ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 1s linear infinite' }}>
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="20 60" />
              </svg>
              Generating…
            </>
          ) : (
            <>✨ Generate Insights</>
          )}
        </button>
      </div>

      {/* Style reference section */}
      <div style={{ marginBottom: 16 }}>
        <button
          onClick={() => setStyleOpen(o => !o)}
          style={{
            background: 'none', border: 'none', padding: 0,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 12, color: theme.textMuted,
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          <span style={{ fontSize: 10, transition: 'transform 0.15s', transform: styleOpen ? 'rotate(90deg)' : 'none' }}>▶</span>
          Style reference {styleRef ? '(set)' : '(none)'}
          {saveStatus && <span style={{ color: '#22c55e', marginLeft: 4 }}>{saveStatus}</span>}
        </button>
        {styleOpen && (
          <div style={{ marginTop: 8, animation: 'fadeIn 0.2s ease' }}>
            <textarea
              value={styleRef}
              onChange={e => setStyleRef(e.target.value)}
              onBlur={handleStyleBlur}
              placeholder={`Paste a previous insights report for ${clientName} here. The AI will mirror its tone and style when generating new insights.`}
              rows={6}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                background: theme.surfaceAlt,
                border: `1px solid ${theme.border}`,
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: 12,
                color: theme.textSecondary,
                fontFamily: "'DM Sans', sans-serif",
                resize: 'vertical',
                outline: 'none',
                lineHeight: 1.5,
              }}
            />
            <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 4 }}>
              Auto-saved per client when you click away.
            </div>
          </div>
        )}
      </div>

      {error && (
        <div style={{
          background: isDark ? '#2d1515' : '#fef2f2',
          color: isDark ? '#fca5a5' : '#991b1b',
          padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 12,
        }}>
          {error}
        </div>
      )}

      {!brief && !generating && !error && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: theme.textMuted, fontSize: 14 }}>
          Click "Generate Insights" to get AI-powered insights for {clientName}
        </div>
      )}

      {generating && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{
              padding: 16, borderRadius: 10,
              background: theme.surfaceAlt,
              animation: 'kpi-pulse 1.6s infinite',
              height: 80,
            }} />
          ))}
        </div>
      )}

      {brief && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, animation: 'fadeIn 0.3s ease' }}>
          {brief.map(section => {
            const cfg = SECTION_CONFIG[section.title] || SECTION_CONFIG['Healthy'];
            return (
              <div key={section.title} style={{
                background: isDark ? cfg.darkBg : cfg.bg,
                border: `1px solid ${cfg.color}40`,
                borderLeft: `3px solid ${cfg.color}`,
                borderRadius: 10,
                padding: '14px 16px',
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontWeight: 700, fontSize: 14,
                  color: cfg.color,
                  marginBottom: 8,
                }}>
                  <span>{cfg.icon}</span>
                  <span>{section.title}</span>
                </div>
                <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
                  {section.bullets.map((b, i) => (
                    <li key={i} style={{
                      display: 'flex', gap: 8,
                      fontSize: 13,
                      color: theme.textSecondary,
                      lineHeight: 1.5,
                      marginBottom: i < section.bullets.length - 1 ? 6 : 0,
                    }}>
                      <span style={{ color: cfg.color, flexShrink: 0, marginTop: 1 }}>•</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
