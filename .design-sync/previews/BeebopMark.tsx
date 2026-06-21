import { BeebopMark } from 'beebop-frontend';

export function Default() {
  return <BeebopMark size={48} />;
}

export function Tones() {
  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
      <BeebopMark size={40} className="text-brand" />
      <BeebopMark size={40} className="text-ink" />
      <div className="bg-ink" style={{ padding: 12, borderRadius: 10, display: 'inline-flex' }}>
        <BeebopMark size={40} className="text-paper" />
      </div>
    </div>
  );
}

export function Sizes() {
  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-end' }}>
      <BeebopMark size={16} />
      <BeebopMark size={24} />
      <BeebopMark size={32} />
      <BeebopMark size={48} />
    </div>
  );
}
