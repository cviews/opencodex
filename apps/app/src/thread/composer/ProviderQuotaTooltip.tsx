import { useEffect, useMemo } from 'react';
import { useProviderStore, resolveProviderApiKey } from '../../stores/provider';
import { useQuotaStore } from '../../stores/quota';
import { CircularProgress } from '../../components/CircularProgress';
import { formatResetTime, getFiveHourLimit, getWeeklyLimit } from '../../services/quotaService';
import { supportsProviderQuota } from './providerQuotaUtils';

export function ProviderQuotaTooltip({
  providerId,
  providerType,
  position,
}: {
  providerId: string;
  providerType?: string;
  position: { top: number; left: number };
}) {
  const providers = useProviderStore((s) => s.providers);
  const loadProviders = useProviderStore((s) => s.loadProviders);
  const apiKey = useMemo(
    () => resolveProviderApiKey(providers, providerId, providerType),
    [providers, providerId, providerType],
  );

  useEffect(() => {
    if (Object.keys(providers).length === 0) {
      loadProviders().catch(() => {});
    }
  }, [providers, loadProviders]);

  useEffect(() => {
    if (!supportsProviderQuota(providerType) || !apiKey) return;
    useQuotaStore.getState().fetchQuota(providerId, apiKey, providerType);
  }, [providerId, providerType, apiKey]);

  const quotaLoading = useQuotaStore((s) => s.loading[providerId]);
  const quotaData = useQuotaStore((s) => s.quotas[providerId]);

  if (!supportsProviderQuota(providerType)) return null;

  if (!apiKey) {
    return (
      <div
        className="fixed z-[60] w-[220px] border border-[#E5E5E5] pointer-events-none"
        style={{ top: position.top, left: position.left }}
      >
        <div className="bg-white text-[#6B6B6B] text-xs rounded-lg px-3 py-2.5 shadow-lg">
          <div className="font-medium text-[#1F1F1F] mb-0.5">需要 API Key</div>
          <div>在设置中配置智谱 API Key 后可查看使用额度</div>
        </div>
      </div>
    );
  }

  if (quotaLoading && !quotaData) {
    return (
      <div
        className="fixed z-[60] w-[200px] border border-[#E5E5E5] pointer-events-none"
        style={{ top: position.top, left: position.left }}
      >
        <div className="bg-white text-[#6B6B6B] text-xs rounded-lg px-3 py-2.5 shadow-lg">
          正在加载额度...
        </div>
      </div>
    );
  }

  if (!quotaData) return null;

  const fiveHour = getFiveHourLimit(quotaData);
  const weekly = getWeeklyLimit(quotaData);
  if (!fiveHour && !weekly) return null;

  const primaryPercentage = fiveHour?.percentage ?? weekly?.percentage ?? 0;

  return (
    <div
      className="fixed z-[60] w-[240px] border border-[#E5E5E5] pointer-events-none"
      style={{ top: position.top, left: position.left }}
    >
      <div className="bg-white text-[#1F1F1F] text-xs rounded-lg px-3 py-2.5 shadow-lg">
        <div className="flex items-center gap-2 mb-1.5">
          <CircularProgress percentage={primaryPercentage} size={20} variant="quota" />
          <span className="font-medium">{primaryPercentage}% 已使用</span>
        </div>
        <div className="space-y-1">
          {fiveHour && (
            <div className="flex items-center justify-between">
              <span className="text-[#9A9A9A]">5小时额度</span>
              <span>{fiveHour.percentage}%</span>
            </div>
          )}
          {weekly && (
            <div className="flex items-center justify-between">
              <span className="text-[#9A9A9A]">每周额度</span>
              <span>{weekly.percentage}%</span>
            </div>
          )}
        </div>
        {(fiveHour?.nextResetTime || weekly?.nextResetTime) && (
          <div className="text-[#9A9A9A] mt-1.5 pt-1.5 border-t border-[#E5E5E5]">
            {formatResetTime(fiveHour?.nextResetTime ?? weekly?.nextResetTime)}
          </div>
        )}
      </div>
    </div>
  );
}
