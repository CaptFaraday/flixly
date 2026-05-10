import { Skeleton } from './Skeleton';

export function BrandShelfSkeleton() {
  return (
    <section>
      <div style={{ marginBottom: 18 }}>
        <Skeleton width={220} height={26} radius={4} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 18 }}>
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} height={0} style={{ aspectRatio: '16/9', height: 'auto' }} radius={8} />
        ))}
      </div>
    </section>
  );
}
