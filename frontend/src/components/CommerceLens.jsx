import { PlatformSection } from './CampaignTable.jsx';

const SALES_PLATFORMS = [
  { key: 'tiktok', label: 'TikTok · Sales' },
  { key: 'meta',   label: 'Meta · Sales' },
  { key: 'google', label: 'Google · Sales' },
];

// Commerce Lens = Meta CPAS accounts + brand-account campaigns named "Sales".
// CPAS comes as one block per billing currency, so mixed-currency markets
// (e.g. ID: IDR and SGD) get separate sections instead of a summed total.
export default function CommerceLens({ theme, commerce, sales, loading }) {
  const cpas = commerce?.cpas ?? [];
  const multiCurrency = cpas.length > 1;
  const salesSections = SALES_PLATFORMS.filter(p => sales?.[p.key]?.campaigns?.length > 0);

  if (loading && cpas.length === 0) {
    return <PlatformSection platform="meta" label="Meta CPAS" data={null} theme={theme} loading />;
  }

  if (cpas.length === 0 && salesSections.length === 0) {
    return (
      <div style={{
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: 14,
        padding: '40px 24px',
        textAlign: 'center',
        color: theme.textMuted,
        fontSize: 14,
      }}>
        No CPAS or Sales campaigns for this market in this period
      </div>
    );
  }

  return (
    <div>
      {cpas.map(block => (
        <PlatformSection
          key={`cpas-${block.currency}`}
          platform="meta"
          label={multiCurrency ? `Meta CPAS · ${block.currency}` : 'Meta CPAS'}
          data={block}
          theme={theme}
          loading={loading}
        />
      ))}
      {salesSections.map(p => (
        <PlatformSection
          key={`sales-${p.key}`}
          platform={p.key}
          label={p.label}
          data={sales[p.key]}
          theme={theme}
          loading={loading}
        />
      ))}
    </div>
  );
}
