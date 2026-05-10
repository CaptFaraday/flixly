import './RowSkeleton.css';
import { Skeleton } from './Skeleton';

export function RowSkeleton() {
  return (
    <section>
      <div className="row-skeleton__header">
        <Skeleton width={220} height={26} radius={4} />
      </div>
      <div className="row-skeleton__grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="row-skeleton__cell">
            <div data-skeleton className="row-skeleton__cell-fill" />
          </div>
        ))}
      </div>
    </section>
  );
}
