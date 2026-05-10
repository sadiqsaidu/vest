"use client";

type Point = { t: number; v: number };

/**
 * Cumulative-vested sparkline. Rendered as a soft area + line in a single
 * accent stroke. Pure SVG, no external chart deps.
 */
export function Sparkline({
  points,
  width = 240,
  height = 56,
  className,
}: {
  points: Point[];
  width?: number;
  height?: number;
  className?: string;
}) {
  if (points.length === 0) return null;

  const pad = 2;
  const xs = points.map((p) => p.t);
  const ys = points.map((p) => p.v);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMax = Math.max(1, Math.max(...ys));
  const xSpan = Math.max(1, xMax - xMin);

  const sx = (t: number) =>
    pad + ((t - xMin) / xSpan) * (width - pad * 2);
  const sy = (v: number) =>
    height - pad - (v / yMax) * (height - pad * 2);

  // Step path — vesting jumps at each unlock, doesn't curve between them.
  const linePath = points
    .map((p, i) => {
      const x = sx(p.t);
      const y = sy(p.v);
      if (i === 0) return `M ${x} ${y}`;
      const prevY = sy(points[i - 1].v);
      return `L ${x} ${prevY} L ${x} ${y}`;
    })
    .join(" ");
  const areaPath = `${linePath} L ${sx(xMax)} ${height - pad} L ${sx(xMin)} ${height - pad} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="vest-spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#vest-spark-fill)" />
      <path
        d={linePath}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.25}
        strokeLinejoin="round"
      />
    </svg>
  );
}
