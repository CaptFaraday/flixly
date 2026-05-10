import './BrandShelfSkeleton.css';
import { Skeleton } from './Skeleton';

export function BrandShelfSkeleton() {
  return (
    <section>
      <div className="brand-shelf-skeleton__header">
        <Skeleton width={220} height={26} radius={4} />
      </div>
      <div className="brand-shelf-skeleton__grid">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="brand-shelf-skeleton__cell">
            <div data-skeleton className="brand-shelf-skeleton__cell-fill" />
          </div>
        ))}
      </div>
    </section>
  );
}
