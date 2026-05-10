import './Skeleton.css';

interface Props {
  width?: number | string;
  height?: number | string;
  radius?: number;
  style?: any;
}

export function Skeleton({ width, height, radius, style }: Props) {
  return (
    <div
      data-skeleton
      className="skeleton"
      style={{
        width, height,
        borderRadius: radius,
        ...style,
      }}
    />
  );
}
