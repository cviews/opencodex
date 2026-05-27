import { useEffect, useState } from 'react';
import { useQuotaStore } from '../stores/quota';
import { formatResetTime } from '../services/quotaService';
import type { QuotaLimit } from '../types';

export function QuotaDisplay({ providerId, apiKey }: { providerId: string; apiKey: string }) {
  const quotas = useQuotaStore((s) => s.quotas);
  const loading = useQuotaStore((s) => s.loading);
  const fetchQuota = useQuotaStore((s) => s.fetchQuota);
  const getFiveHourQuota = useQuotaStore((s) => s.getFiveHourQuota);
  const getWeeklyQuota = useQuotaStore((s) => s.getWeeklyQuota);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (!fetched && apiKey) {
      fetchQuota(providerId, apiKey);
      setFetched(true);
    }
  }, [providerId, apiKey, fetched, fetchQuota]);

  if (loading[providerId]) {
    return <div className="text-xs text-[#9A9A9A] py-2">加载额度信息...</div>;
  }

  const data = quotas[providerId];
  if (!data) return null;

  const fiveHour = getFiveHourQuota(providerId);
  const weekly = getWeeklyQuota(providerId);

  if (!fiveHour && !weekly) return null;

  return (
    <div className="space-y-3 mt-2">
      {fiveHour && <QuotaBar limit={fiveHour} label="5小时使用额度" />}
      {weekly && <QuotaBar limit={weekly} label="每周使用额度" />}
    </div>
  );
}

function QuotaBar({ limit, label }: { limit: QuotaLimit; label: string }) {
  const percentage = Math.min(limit.percentage, 100);
  const resetText = formatResetTime(limit.nextResetTime);
  const barColor = percentage > 80 ? '#EC5F66' : percentage > 50 ? '#F0AD4E' : '#2B8FFF';

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-[#6B6B6B]">{label}</span>
        <span className="text-xs text-[#9A9A9A]">{percentage}%{resetText ? ` · ${resetText}` : ''}</span>
      </div>
      <div className="w-full h-1.5 bg-[#E5E5E5] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${percentage}%`, backgroundColor: barColor }}
        />
      </div>
    </div>
  );
}