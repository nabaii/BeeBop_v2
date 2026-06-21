import { Skeleton } from 'beebop-frontend';

export function TextLines() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 320 }}>
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

export function Avatar() {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <Skeleton className="h-12 w-12 rounded-full" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, maxWidth: 220 }}>
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    </div>
  );
}

export function Block() {
  return <Skeleton className="h-32 w-full max-w-xs rounded-xl" />;
}
