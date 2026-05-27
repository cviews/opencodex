function getUsageColor(percentage: number): string {
  if (percentage < 70) return '#10A37F';
  if (percentage < 90) return '#F59E0B';
  return '#EF4444';
}

export function CircularProgress({
  percentage,
  size = 16,
  variant = 'default',
}: {
  percentage: number;
  size?: number;
  variant?: 'default' | 'usage' | 'quota';
}) {
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(percentage, 0), 100);
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

  const progressColor =
    variant === 'usage'
      ? getUsageColor(clamped)
      : variant === 'quota' && clamped >= 90
        ? '#EF4444'
        : variant === 'quota' && clamped >= 70
          ? '#F59E0B'
          : '#2B8FFF';

  return (
    <svg width={size} height={size} className="transform -rotate-90 shrink-0">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#E5E5E5" strokeWidth={strokeWidth} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={progressColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        className="transition-all duration-300"
      />
    </svg>
  );
}
