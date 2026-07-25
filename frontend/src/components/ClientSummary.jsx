import { useState } from 'react';
import { generateSummary } from '../api.js';

const ALL_SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'meta', label: 'Meta Performance' },
  { id: 'google', label: 'Google Performance' },
  { id: 'campaigns', label: 'Campaign Analysis' },
  { id: 'recommendations', label: 'Recommendations' },
];

const TONES = [
  { value: 'executive', label: 'Executive' },
  { value: 'technical', label: 'Technical' },
  { value: 'client-friendly', label: 'Client-Friendly' },
];

function renderMarkdown(text, theme) {
  const lines = text.split('\n');
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('## ')) {
      elements.push(
        <h3 key={i} style={{
          fontSize: 15, fontWeight: 700,
          fontFamily: "'Space Grotesk', sans-serif",
          color: theme.textPrimary,
          margin: '20px 0 8px',
          paddingTop: 16,
          borderTop: `1px solid ${theme.border}`,
        }}>
          {line.slice(3)}
        </h3>
      );
    } else if (line.startsWith('### ')) {
      elements.push(
        <h4 key={i} style={{ fontSize: 13, fontWeight: 600, color: theme.textPrimary, margin: '12px 0 4px' }}>
          {line.slice(4)}
        </h4>
      );
    } else if (line.startsWith('- ') || line.startsWith('• ')) {
      elements.push(
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
          <span style={{ color: theme.accent, flexShrink: 0 }}>•</span>
          <span style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 1.6 }}>
            {line.replace(/^[-•]\s*/, '').replace(/\*\*(.+?)\*\*/g, '$1')}
          </span>
        </div>
      );
    } else if (line.trim()) {
      elements.push(
        <p key={i} style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 1.7, margin: '6px 0' }}>
          {line.replace(/\*\*(.+?)\*\*/g, '$1')}
        </p>
      );
    }
    i++;
  }
  return elements;
}

export default function ClientSummary({ theme, data, clientName, loading: dataLoading }) {
  const [selectedSections, setSelectedSections] = useState(['overview', 'meta', 'recommendations']);
  const [tone, setTone] = useState('client-friendly');
  const [report, setReport] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  const handleGenerate = async () => {
    if (!data) return;
    setGenerating(true);
    setError(null);
    setReport(null);
    try {
      const labels = selectedSections.map(id => ALL_SECTIONS.find(s => s.id === id)?.label).filter(Boolean);
      const text = await generateSummary(data, clientName, labels, tone);
      setReport(text);
    } catch (e) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const toggleSection = (id) => {
    setSelectedSections(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const isDark = theme.bg.startsWith('#0') || theme.bg.startsWith('#08');

  return (
    <div style={{
      background: theme.surface,
      border: `1px solid ${theme.border}`,
      borderRadius: 14,
      padding: '20px 24px',
      transition: 'background 0.25s',
    }}>
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 15, color: theme.textPrimary, marginBottom: 16 }}>
        Client Summary
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 16, alignItems: 'flex-start' }}>
        {/* Section selector */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, fontFamily: "'Space Grotesk', sans-serif" }}>
            Sections
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {ALL_SECTIONS.map(s => {
              const active = selectedSections.includes(s.id);
              return (
                <button key={s.id} onClick={() => toggleSection(s.id)} style={{
                  padding: '5px 12px', borderRadius: 20,
                  border: `1px solid ${active ? theme.accent : theme.border}`,
                  background: active ? theme.accentLight : 'transparent',
                  color: active ? theme.accent : theme.textSecondary,
                  fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif",
                  transition: 'all 0.15s',
                }}>
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tone selector */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, fontFamily: "'Space Grotesk', sans-serif" }}>
            Tone
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {TONES.map(t => {
              const active = tone === t.value;
              return (
                <button key={t.value} onClick={() => setTone(t.value)} style={{
                  padding: '5px 12px', borderRadius: 20,
                  border: `1px solid ${active ? theme.accent : theme.border}`,
                  background: active ? theme.accentLight : 'transparent',
                  color: active ? theme.accent : theme.textSecondary,
                  fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif",
                  transition: 'all 0.15s',
                }}>
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Generate button */}
        <div style={{ marginLeft: 'auto', alignSelf: 'flex-end' }}>
          <button
            onClick={handleGenerate}
            disabled={generating || dataLoading || !data || selectedSections.length === 0}
            style={{
              background: generating ? theme.surfaceAlt : 'linear-gradient(135deg, #2563eb, #7c3aed)',
              color: generating ? theme.textMuted : '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '8px 18px',
              fontSize: 13, fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
              cursor: generating || dataLoading || !data || selectedSections.length === 0 ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              opacity: generating || dataLoading || !data || selectedSections.length === 0 ? 0.6 : 1,
              transition: 'opacity 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            {generating ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 1s linear infinite' }}>
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="20 60" />
                </svg>
                Generating…
              </>
            ) : '📄 Generate Report'}
          </button>
        </div>
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

      {!report && !generating && !error && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: theme.textMuted, fontSize: 14 }}>
          Select sections and tone, then click "Generate Report"
        </div>
      )}

      {generating && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8 }}>
          {[200, 160, 220, 140].map((w, i) => (
            <div key={i} style={{ height: 14, background: theme.border, borderRadius: 4, width: `${w}px`, maxWidth: '100%', animation: 'kpi-pulse 1.6s infinite' }} />
          ))}
        </div>
      )}

      {report && (
        <div style={{
          borderTop: `1px solid ${theme.border}`,
          paddingTop: 16,
          animation: 'fadeIn 0.3s ease',
        }}>
          {renderMarkdown(report, theme)}
        </div>
      )}
    </div>
  );
}
