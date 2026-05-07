export function ScheduleDiagram() {
  const dots = Array.from({ length: 12 });
  return (
    <svg
      viewBox="0 0 720 200"
      role="img"
      aria-label="A vesting schedule with the early months unlocked, today marked, and future amounts redacted."
      className="w-full max-w-[720px] mx-auto text-text"
    >
      {/* redacted amount blocks above filled dots */}
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={`r-${i}`}
          x={28 + i * 56 - 14}
          y={48}
          width={28}
          height={10}
          rx={2}
          fill="currentColor"
          opacity={0.18}
        />
      ))}
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={`r2-${i}`}
          x={28 + i * 56 - 18}
          y={62}
          width={36}
          height={10}
          rx={2}
          fill="currentColor"
          opacity={0.1}
        />
      ))}

      {/* horizontal axis line */}
      <line
        x1={20}
        x2={700}
        y1={110}
        y2={110}
        stroke="currentColor"
        strokeOpacity={0.15}
        strokeWidth={1}
      />

      {dots.map((_, i) => {
        const cx = 28 + i * 56;
        const isFilled = i < 4;
        const isToday = i === 4 || i === 5;
        const radius = 6;
        if (isFilled) {
          return <circle key={i} cx={cx} cy={110} r={radius} fill="currentColor" />;
        }
        if (isToday) {
          return (
            <circle
              key={i}
              cx={cx}
              cy={110}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeDasharray="2 2"
            />
          );
        }
        return (
          <circle
            key={i}
            cx={cx}
            cy={110}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.35}
            strokeWidth={1}
          />
        );
      })}

      {/* "today" label below dots 5-6 (indexes 4,5) */}
      <line
        x1={28 + 4 * 56 - 4}
        x2={28 + 5 * 56 + 4}
        y1={132}
        y2={132}
        stroke="currentColor"
        strokeOpacity={0.5}
        strokeDasharray="2 3"
      />
      <text
        x={28 + 4.5 * 56}
        y={150}
        textAnchor="middle"
        className="fill-current"
        fontFamily="JetBrains Mono Variable, monospace"
        fontSize={11}
        opacity={0.6}
      >
        today
      </text>
    </svg>
  );
}
