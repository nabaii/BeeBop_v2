import { Price } from 'beebop-frontend';

export function Default() {
  return <Price value={1200000} className="text-section font-semibold text-ink" />;
}

export function Column() {
  return (
    <div
      className="text-title text-ink"
      style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', width: 160 }}
    >
      <Price value={1200000} />
      <Price value={850000} />
      <Price value={420000} />
    </div>
  );
}

export function OnRequest() {
  return <Price value={null} fallback="Price on request" className="text-body text-ink-muted" />;
}
