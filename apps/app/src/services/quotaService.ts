import type { QuotaData, QuotaLimit } from '../types';

const ZHIPUAI_QUOTA_URL = 'https://bigmodel.cn/api/monitor/usage/quota/limit';

export async function fetchZhipuAIQuota(apiKey: string): Promise<QuotaData | null> {
  try {
    const response = await fetch(ZHIPUAI_QUOTA_URL, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      console.warn('ZhipuAI quota API returned non-OK status:', response.status);
      return null;
    }

    const json = await response.json();

    if (json.code !== 200 || !json.success) {
      console.warn('ZhipuAI quota API returned error:', json.msg);
      return null;
    }

    const limits: QuotaLimit[] = (json.data?.limits || []).map((limit: any) => ({
      type: limit.type as string,
      unit: limit.unit as number,
      number: limit.number as number,
      percentage: limit.percentage as number || 0,
      nextResetTime: limit.nextResetTime as number | undefined,
      usage: limit.usage as number | undefined,
      remaining: limit.remaining as number | undefined,
      currentValue: limit.currentValue as number | undefined,
      usageDetails: limit.usageDetails || [],
      level: json.data?.level as string | undefined,
    }));

    return {
      limits,
      level: json.data?.level as string | undefined,
    };
  } catch (err) {
    console.error('Failed to fetch ZhipuAI quota:', err);
    return null;
  }
}

/**
 * Get the 5-hour quota limit (unit=3 means 5 hours in ZhipuAI API)
 * unit: 3 = 每5小时, 5 = 每天, 6 = 每周
 */
export function getFiveHourLimit(data: QuotaData): QuotaLimit | null {
  return data.limits.find(l => l.type === 'TOKENS_LIMIT' && l.unit === 3) || null;
}

/**
 * Get the weekly quota limit (unit=6 means weekly in ZhipuAI API)
 */
export function getWeeklyLimit(data: QuotaData): QuotaLimit | null {
  const weekly = data.limits.find(l => l.type === 'TOKENS_LIMIT' && l.unit === 6);
  return weekly || null;
}

/**
 * Format reset time from epoch ms to readable string
 */
export function formatResetTime(nextResetTime: number | undefined): string {
  if (!nextResetTime) return '';
  const date = new Date(nextResetTime);
  const now = new Date();
  const diffMs = nextResetTime - now.getTime();

  if (diffMs <= 0) return '即将重置';

  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 60) return `${diffMinutes}分钟后重置`;

  const diffHours = Math.floor(diffMinutes / 60);
  const remainMinutes = diffMinutes % 60;
  if (diffHours < 24) return `${diffHours}小时${remainMinutes > 0 ? `${remainMinutes}分钟` : ''}后重置`;

  const diffDays = Math.floor(diffHours / 24);
  const remainHours = diffHours % 24;
  return `${diffDays}天${remainHours > 0 ? `${remainHours}小时` : ''}后重置`;
}