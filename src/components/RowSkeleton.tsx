import { Skeleton } from './Skeleton';

export function RowSkeleton() {
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, marginBottom: 18 }}>
        <Skeleton width={220} height={26} radius={4} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 18 }}>
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} style={{ position: 'relative', width: '100%', paddingTop: '56.25%' }}>
            <div data-skeleton style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 8 }} />
          </div>
        ))}
      </div>
    </section>
  );
}
