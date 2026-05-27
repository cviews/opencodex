import { useEffect, useMemo } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { CircularProgress } from '../../components/CircularProgress';
import { useQuotaStore } from '../../stores/quota';
import { resolveProviderApiKey, useProviderStore } from '../../stores/provider';

export { supportsProviderQuota } from './providerQuotaUtils';

export function ProviderQuotaBadge({
  providerId,
  providerType,
  size = 14,
}: {
  providerId: string;
  providerType?: string;
  size?: number;
}) {
  const providers = useProviderStore((s) => s.providers);
  const loadProviders = useProviderStore((s) => s.loadProviders);
  const apiKey = useMemo(
    () => resolveProviderApiKey(providers, providerId, providerType),
    [providers, providerId, providerType],
  );
  const fiveHourQuota = useQuotaStore((s) => s.getFiveHourQuota(providerId));
  const fetchQuota = useQuotaStore((s) => s.fetchQuota);
  const loading = useQuotaStore((s) => s.loading[providerId]);

  useEffect(() => {
    if (Object.keys(providers).length === 0) {
      loadProviders().catch(() => {});
    }
  }, [providers, loadProviders]);

  useEffect(() => {
    if (providerType !== 'zhipuai-coding' || !apiKey) return;
    fetchQuota(providerId, apiKey, providerType);
  }, [providerId, providerType, apiKey, fetchQuota]);

  if (providerType !== 'zhipuai-coding') return null;

  if (!apiKey) {
    return (
      <span
        className="inline-flex items-center gap-0.5 shrink-0 text-[#F59E0B]"
        title="需配置 API Key 后查看额度"
      >
        <KeyRound size={size - 2} />
      </span>
    );
  }

  if (loading) {
    return <Loader2 size={size} className="animate-spin text-[#9A9A9A] shrink-0" />;
  }

  const percentage = fiveHourQuota?.percentage ?? 0;
  return (
    <span title={`5小时额度 ${percentage}% 已使用`}>
      <CircularProgress percentage={percentage} size={size} variant="quota" />
    </span>
  );
}
