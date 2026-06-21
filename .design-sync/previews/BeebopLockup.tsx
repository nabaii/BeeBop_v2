import { BeebopLockup } from 'beebop-frontend';

export function Default() {
  return <BeebopLockup />;
}

export function Sizes() {
  return (
    <div style={{ display: 'flex', gap: 28, alignItems: 'flex-end' }}>
      <BeebopLockup size={20} />
      <BeebopLockup size={28} />
      <BeebopLockup size={40} />
    </div>
  );
}

export function Mono() {
  return <BeebopLockup markClassName="text-ink" />;
}

export function Knockout() {
  return (
    <div className="bg-brand" style={{ padding: 24, borderRadius: 12, display: 'inline-block' }}>
      <BeebopLockup markClassName="text-paper" wordClassName="text-paper" />
    </div>
  );
}
