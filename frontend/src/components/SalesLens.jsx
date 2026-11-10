import { Fragment, useEffect, useRef, useState } from 'react';
import { BreakableName } from '../campaignName.jsx';

// Sales Lens: mega-sale periods (2.2, 9.9, 11.11 ...) side by side, Meta CPAS,
// SGD. Periods come from the double date in the ad names.

const fmtSgd = v => (v == null ? '—' : `SGD ${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const fmtSgdShort = v => (v >= 10000 ? `SGD ${(v / 1000).toFixed(1)}K` : `SGD ${Math.round(v).toLocaleString('en-US')}`);
const fmtNum = v => (v == null ? '—' : Math.round(v).toLocaleString('en-US'));
const fmtRoas = v => (v == null ? '—' : `${v.toFixed(2)}x`);
const fmtDay = iso => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '?');

function niceMax(max) {
  if (!(max > 0)) return 1;
  const mag = 10 ** Math.floor(Math.log10(max));
  return [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map(m => m * mag).find(v => v >= max);
}

function useWidth(ref) {
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

// One measure across sales: bars, the best sale highlighted, hover shared
function SaleBars({ title, sales, value, format, axisFormat, best, hover, setHover, theme, darkMode, isLowSpend }) {
  const ref = useRef(null);
  const width = useWidth(ref);
  const H = 160, M = { top: 18, right: 8, bottom: 22, left: 46 };
  const iw = Math.max(0, width - M.left - M.right), ih = H - M.top - M.bottom;
  const color = darkMode ? '#60a5fa' : '#2563eb';
  const values = sales.map(value);
  // Token-spend sales (e.g. SGD 4 at 87x ROAS) don't set the scale; their bar is
  // clipped at the top, greyed and labelled with the real value
  const lowSpend = i => !!isLowSpend?.(sales[i]);
  const scaleValues = values.filter((v, i) => v != null && !lowSpend(i));
  const top = niceMax(Math.max(0, ...(scaleValues.length ? scaleValues : values.filter(v => v != null))));
  const band = sales.length ? iw / sales.length : 0;
  const cx = i => M.left + band * (i + 0.5);
  const y = v => M.top + ih - (v / top) * ih;
  const barW = Math.min(24, band * 0.6);

  return (
    <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 12, padding: '12px 14px 8px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: theme.textMuted, fontFamily: "'Space Grotesk', sans-serif" }}>{title}</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: theme.textPrimary, fontFamily: "'Space Grotesk', sans-serif" }}>
          {hover != null ? `${sales[hover].label} · ${format(values[hover])}` : ''}
        </span>
      </div>
      <div ref={ref}>
        {width > 0 && (
          <svg width={width} height={H} role="img" aria-label={`${title} by mega sale`} style={{ display: 'block' }}
            onPointerMove={e => {
              const r = ref.current.getBoundingClientRect();
              const i = Math.floor((e.clientX - r.left - M.left) / band);
              setHover(i >= 0 && i < sales.length ? i : null);
            }}
            onPointerLeave={() => setHover(null)}>
            {[0, top / 2, top].map(t => (
              <g key={t}>
                <line x1={M.left} x2={M.left + iw} y1={y(t)} y2={y(t)} stroke={theme.border} strokeWidth="1" />
                <text x={M.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize="10.5" fill={theme.textMuted}>{axisFormat(t)}</text>
              </g>
            ))}
            {hover != null && <rect x={M.left + band * hover} y={M.top} width={band} height={ih} fill={theme.surfaceAlt} />}
            {sales.map((s, i) => {
              const v = values[i];
              if (!(v > 0)) return null;
              const clipped = v > top;
              const vv = Math.min(v, top);
              const h = y(0) - y(vv), r = Math.min(4, h / 2);
              return (
                <g key={s.key}>
                  <path d={`M${cx(i) - barW / 2},${y(0)} V${y(vv) + r} q0,-${r} ${r},-${r} H${cx(i) + barW / 2 - r} q${r},0 ${r},${r} V${y(0)} Z`}
                    fill={lowSpend(i) ? theme.borderStrong : color} opacity={hover == null || hover === i ? 1 : 0.45} />
                  {clipped && (
                    <text x={cx(i)} y={y(vv) - 5} textAnchor="middle" fontSize="10.5" fill={theme.textMuted}>↑{axisFormat(v)}</text>
                  )}
                  {best === i && !clipped && (
                    <text x={cx(i)} y={y(v) - 5} textAnchor="middle" fontSize="10.5" fontWeight="700" fill={theme.textPrimary}>{axisFormat(v)}</text>
                  )}
                </g>
              );
            })}
            {sales.map((s, i) => (
              <text key={s.key} x={cx(i)} y={H - 6} textAnchor="middle" fontSize="11" fontWeight={hover === i ? 700 : 500} fill={hover === i ? theme.textPrimary : theme.textSecondary}>{s.label}</text>
            ))}
            <line x1={M.left} x2={M.left + iw} y1={y(0)} y2={y(0)} stroke={theme.borderStrong} strokeWidth="1" />
          </svg>
        )}
      </div>
    </div>
  );
}

function Delta({ pct, goodWhenUp = true, theme, darkMode }) {
  if (pct == null || !isFinite(pct)) return <span style={{ color: theme.textMuted }}>—</span>;
  const good = goodWhenUp ? pct >= 0 : pct <= 0;
  const color = good ? (darkMode ? '#34d399' : '#047857') : (darkMode ? '#f87171' : '#b91c1c');
  const a = Math.abs(pct);
  return <span style={{ color, fontWeight: 600 }}>{pct >= 0 ? '▲' : '▼'} {a < 10 ? a.toFixed(1) : Math.round(a)}%</span>;
}

export default function SalesLens({ state, theme, darkMode, marketName }) {
  const [hover, setHover] = useState(null);
  const [open, setOpen] = useState(() => new Set());
  const [showOther, setShowOther] = useState(false);
  const data = state?.data;
  const sales = data?.sales || [];

  // Highest value; for ROAS ignore sales with a token spend (e.g. SGD 4 for 87x)
  // so "best" means a sale that actually ran: at least 20% of the average spend
  const avgSpend = sales.length ? sales.reduce((a, s) => a + s.spend, 0) / sales.length : 0;
  const isLowSpend = s => s.lowSpend ?? s.spend < avgSpend * 0.2;
  const idxBest = key => {
    let best = null;
    sales.forEach((s, i) => {
      if (s[key] == null || (key === 'roas' && s.spend < avgSpend * 0.2)) return;
      if (best == null || s[key] > sales[best][key]) best = i;
    });
    return best;
  };
  const bestRoas = idxBest('roas');

  const th = { padding: '8px 10px', fontSize: 10.5, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: theme.textMuted, fontFamily: "'Space Grotesk', sans-serif", whiteSpace: 'nowrap', borderBottom: `1px solid ${theme.border}` };
  const td = { padding: '10px 10px', whiteSpace: 'nowrap', verticalAlign: 'top' };

  return (
    <div>
      <div style={{ background: theme.surfaceAlt, border: `1px solid ${theme.border}`, borderRadius: 14, padding: '14px 20px 18px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: theme.textPrimary, fontFamily: "'Space Grotesk', sans-serif" }}>
            {marketName ? `${marketName} · ` : ''}Mega sales compared
          </span>
          <span style={{ fontSize: 13, color: theme.textMuted }}>
            Meta CPAS · SGD · since {data?.dateRange ? fmtDay(data.dateRange.startDate) + ' ' + data.dateRange.startDate.slice(0, 4) : '1 Jan'} · sales found from the date in each ad name (e.g. 9.9, 11.11) · not affected by the date filter
          </span>
        </div>

        {state?.loading && !sales.length && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            {[0, 1, 2].map(i => <div key={i} style={{ height: 200, borderRadius: 12, background: theme.surface, border: `1px solid ${theme.border}`, animation: 'kpi-pulse 1.6s ease-in-out infinite' }} />)}
          </div>
        )}
        {state?.error && <div style={{ fontSize: 13, color: darkMode ? '#fca5a5' : '#991b1b' }}>Could not load mega sales: {state.error}</div>}
        {!state?.loading && !state?.error && data && !sales.length && (
          <div style={{ fontSize: 13, color: theme.textMuted, padding: '20px 0' }}>No mega-sale ads (e.g. "…_9.9 Sale") found in this market's Meta CPAS accounts yet.</div>
        )}
        {sales.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            <SaleBars title="Spend" sales={sales} value={s => s.spend} format={fmtSgdShort}
              axisFormat={v => (v >= 1000 ? `${+(v / 1000).toFixed(1)}K` : Math.round(v))} best={idxBest('spend')}
              hover={hover} setHover={setHover} theme={theme} darkMode={darkMode} />
            <SaleBars title="Orders" sales={sales} value={s => s.orders} format={fmtNum}
              axisFormat={v => (v >= 1000 ? `${+(v / 1000).toFixed(1)}K` : Math.round(v))} best={idxBest('orders')}
              hover={hover} setHover={setHover} theme={theme} darkMode={darkMode} />
            <SaleBars title="ROAS" sales={sales} value={s => s.roas} format={fmtRoas}
              axisFormat={v => `${+v.toFixed(1)}x`} best={bestRoas} isLowSpend={isLowSpend}
              hover={hover} setHover={setHover} theme={theme} darkMode={darkMode} />
          </div>
        )}
      </div>

      {sales.length > 0 && (
        <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: theme.surfaceAlt }}>
                  <th style={{ ...th, textAlign: 'left' }}>Sale</th>
                  <th style={{ ...th, textAlign: 'left' }}>Ran</th>
                  <th style={{ ...th, textAlign: 'right' }}>Spend</th>
                  <th style={{ ...th, textAlign: 'right' }}>Orders</th>
                  <th style={{ ...th, textAlign: 'right' }}>ROAS</th>
                  <th style={{ ...th, textAlign: 'right' }}>Revenue</th>
                  <th style={{ ...th, textAlign: 'right' }}>CPA</th>
                  <th style={{ ...th, textAlign: 'right' }} title="Change vs the previous mega sale that wasn't LOW SPEND">vs prev · Spend</th>
                  <th style={{ ...th, textAlign: 'right' }}>Orders</th>
                  <th style={{ ...th, textAlign: 'right' }}>ROAS</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s, i) => {
                  const isOpen = open.has(s.key);
                  return (
                    <Fragment key={s.key}>
                      <tr
                        onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
                        style={{ borderTop: `1px solid ${theme.border}`, background: hover === i ? theme.surfaceHover : 'transparent' }}>
                        <td style={{ ...td, whiteSpace: 'normal' }}>
                          <button
                            onClick={() => setOpen(o => { const n = new Set(o); n.has(s.key) ? n.delete(s.key) : n.add(s.key); return n; })}
                            aria-expanded={isOpen}
                            style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: theme.textPrimary, display: 'flex', alignItems: 'flex-start', gap: 6, textAlign: 'left' }}>
                            <span style={{ display: 'inline-block', transition: 'transform 0.15s', transform: isOpen ? 'rotate(90deg)' : 'none', color: theme.textMuted }}>▸</span>
                            <span>
                              <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif" }}>{s.label}</span>
                              <span style={{ color: theme.textMuted }}> {s.year}</span>
                              {isLowSpend(s) && <span title="Spend under 20% of the average sale: left out of best ROAS and the ROAS chart scale" style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: theme.textMuted, background: theme.surfaceAlt, padding: '1px 6px', borderRadius: 4, cursor: 'help' }}>LOW SPEND</span>}
                              {bestRoas === i && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: darkMode ? '#34d399' : '#047857', background: darkMode ? 'rgba(52,211,153,0.12)' : '#ecfdf5', padding: '1px 6px', borderRadius: 4 }}>BEST ROAS</span>}
                              {s.themes.length > 0 && <span style={{ display: 'block', fontSize: 11.5, color: theme.textSecondary }}>{s.themes.join(' · ')}</span>}
                            </span>
                          </button>
                        </td>
                        <td style={{ ...td, color: theme.textSecondary }}>
                          {fmtDay(s.firstDate)} – {fmtDay(s.lastDate)}
                          <span style={{ display: 'block', fontSize: 11, color: theme.textMuted }}>{s.activeDays} day{s.activeDays === 1 ? '' : 's'} with spend</span>
                        </td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmtSgd(s.spend)}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmtNum(s.orders)}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmtRoas(s.roas)}</td>
                        <td style={{ ...td, textAlign: 'right', color: theme.textSecondary }}>{fmtSgd(s.revenue)}</td>
                        <td style={{ ...td, textAlign: 'right', color: theme.textSecondary }}>{fmtSgd(s.cpa)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>
                          <Delta pct={s.vsPrevious?.spend} theme={theme} darkMode={darkMode} />
                          {s.vsPrevious && <span style={{ display: 'block', fontSize: 11, color: theme.textMuted }}>vs {s.vsPrevious.label}</span>}
                        </td>
                        <td style={{ ...td, textAlign: 'right' }}><Delta pct={s.vsPrevious?.orders} theme={theme} darkMode={darkMode} /></td>
                        <td style={{ ...td, textAlign: 'right' }}><Delta pct={s.vsPrevious?.roas} theme={theme} darkMode={darkMode} /></td>
                      </tr>
                      {isOpen && s.ads.map(a => (
                        <tr key={`${s.key}-${a.campaign}-${a.ad}`} style={{ background: theme.surfaceAlt, fontSize: 12 }}>
                          <td colSpan={2} style={{ ...td, paddingLeft: 32, whiteSpace: 'normal', color: theme.textSecondary }}>
                            <span style={{ color: theme.textPrimary }}><BreakableName name={a.ad} /></span>
                            <span style={{ display: 'block', fontSize: 11, color: theme.textMuted }}><BreakableName name={a.campaign} /></span>
                          </td>
                          <td style={{ ...td, textAlign: 'right' }}>{fmtSgd(a.spend)}</td>
                          <td style={{ ...td, textAlign: 'right' }}>{fmtNum(a.orders)}</td>
                          <td style={{ ...td, textAlign: 'right' }}>{fmtRoas(a.roas)}</td>
                          <td style={{ ...td, textAlign: 'right', color: theme.textSecondary }}>{fmtSgd(a.revenue)}</td>
                          <td style={{ ...td, textAlign: 'right', color: theme.textSecondary }}>{fmtSgd(a.cpa)}</td>
                          <td colSpan={3} />
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data?.notSale?.length > 0 && (
        <div style={{ fontSize: 12, color: theme.textMuted }}>
          <button onClick={() => setShowOther(v => !v)} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: theme.textSecondary, fontSize: 12 }}>
            {showOther ? '▾' : '▸'} {data.notSale.length} ad{data.notSale.length === 1 ? '' : 's'} without a mega-sale date not counted ({fmtSgdShort(data.notSale.reduce((a, x) => a + x.spend, 0))} spend)
          </button>
          {showOther && (
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {data.notSale.map(a => <li key={a.ad}>{a.ad} · {fmtSgdShort(a.spend)} · {fmtNum(a.orders)} orders · {fmtRoas(a.roas)}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
