import './HeroSkeleton.css';
import { Skeleton } from './Skeleton';

export function HeroSkeleton() {
  return (
    <div className="hero-skeleton">
      <div className="hero-skeleton__overlay" />
      <div className="hero-skeleton__content">
        <Skeleton width={140} height={26} radius={999} style={{ marginBottom: 24 }} />
        <Skeleton width={'72%'} height={84} radius={4} style={{ marginBottom: 18 }} />
        <Skeleton width={'42%'} height={20} radius={4} style={{ marginBottom: 22 }} />
        <Skeleton width={'94%'} height={18} radius={4} style={{ marginBottom: 8 }} />
        <Skeleton width={'88%'} height={18} radius={4} style={{ marginBottom: 32 }} />
        <div className="hero-skeleton__btns">
          <Skeleton width={130} height={48} radius={4} />
          <Skeleton width={170} height={48} radius={4} style={{ marginLeft: 12 }} />
        </div>
      </div>
    </div>
  );
}
