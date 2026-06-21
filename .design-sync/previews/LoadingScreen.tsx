import { LoadingScreen } from 'beebop-frontend';

export function Default() {
  return <LoadingScreen />;
}

export function CustomMessage() {
  return <LoadingScreen message="Finding verified homes near you…" />;
}
