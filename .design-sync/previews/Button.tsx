import { Button } from 'beebop-frontend';

const row: React.CSSProperties = { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' };

export function Variants() {
  return (
    <div style={row}>
      <Button variant="primary">Send message</Button>
      <Button variant="secondary">Save draft</Button>
      <Button variant="ghost">Cancel</Button>
      <Button variant="danger">Delete listing</Button>
    </div>
  );
}

export function Disabled() {
  return (
    <div style={row}>
      <Button variant="primary" disabled>Send message</Button>
      <Button variant="secondary" disabled>Save draft</Button>
    </div>
  );
}

export function FullWidth() {
  return (
    <div style={{ maxWidth: 320 }}>
      <Button variant="primary" className="w-full">Continue to payment</Button>
    </div>
  );
}
