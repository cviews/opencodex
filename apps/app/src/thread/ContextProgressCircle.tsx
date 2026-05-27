import { useState } from 'react';
import { ContextStatusPopup } from './ContextStatusPopup';

interface ContextProgressCircleProps {
  percentage: number; // 0-100
}

export function ContextProgressCircle({ percentage }: ContextProgressCircleProps) {
  const [showPopup, setShowPopup] = useState(false);

  // Color bands: <70% green, 70-90% yellow, >90% red
  const color = percentage < 70 ? '#10A37F' : percentage < 90 ? '#F59E0B' : '#EF4444';

  // SVG circle progress
  const radius = 8;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative">
      <button
        onClick={() => setShowPopup(!showPopup)}
        className="flex-shrink-0 p-1 rounded-md text-[#9EA1AA] hover:text-[#D8DEE9] hover:bg-[#2A2B2D] transition-colors"
        title="Context usage"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" className="rotate-[-90deg]">
          {/* Background circle */}
          <circle
            cx="10" cy="10" r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="2"
          />
          {/* Progress circle */}
          <circle
            cx="10" cy="10" r={radius}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-[stroke-dashoffset] duration-300"
          />
        </svg>
      </button>

      {showPopup && (
        <ContextStatusPopup
          percentage={percentage}
          onClose={() => setShowPopup(false)}
        />
      )}
    </div>
  );
}
