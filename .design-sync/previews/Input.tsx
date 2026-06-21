import { Input } from 'beebop-frontend';

const field: React.CSSProperties = { maxWidth: 360 };

export function Default() {
  return <div style={field}><Input placeholder="Search Abuja for a verified home…" /></div>;
}

export function Filled() {
  return <div style={field}><Input defaultValue="Maitama, Abuja" /></div>;
}

export function Invalid() {
  return <div style={field}><Input defaultValue="not-an-email" invalid /></div>;
}

export function Disabled() {
  return <div style={field}><Input defaultValue="Locked field" disabled /></div>;
}
