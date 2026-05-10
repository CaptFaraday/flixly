import { Skeleton } from './Skeleton';

export function HeroSkeleton() {
  return (
    <div style={frameStyle}>
      <div style={overlayStyle} />
      <div style={contentStyle}>
        <Skeleton width={140} height={26} radius={999} style={{ marginBottom: 24 }} />
        <Skeleton width={'72%'} height={84} radius={4} style={{ marginBottom: 18 }} />
        <Skeleton width={'42%'} height={20} radius={4} style={{ marginBottom: 22 }} />
        <Skeleton width={'94%'} height={18} radius={4} style={{ marginBottom: 8 }} />
        <Skeleton width={'88%'} height={18} radius={4} style={{ marginBottom: 32 }} />
        <div style={{ display: 'flex', gap: 12 }}>
          <Skeleton width={130} height={48} radius={4} />
          <Skeleton width={170} height={48} radius={4} />
        </div>
      </div>
    </div>
  );
}

const frameStyle: any = {
  position: 'absolute', top: 0, left: 0, right: 0, height: '60%',
  overflow: 'hidden',
};
const overlayStyle: any = {
  position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
  background: 'linear-gradient(180deg, rgba(20,20,22,0.4) 0%, rgba(10,10,10,0.85) 75%, var(--bg) 100%)',
};
const contentStyle: any = {
  position: 'absolute', bottom: '11%', left: '5%', maxWidth: '42%',
  zIndex: 5,
};
