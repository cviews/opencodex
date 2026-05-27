export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  opencodeUrl?: string;
  opencodeConnected?: boolean;
}
