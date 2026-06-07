import { loadPipelineEnv, requirePipelineEnv } from './env';
import type { PlatformRegion, RegionalRouting } from './types';

loadPipelineEnv();

const temporaryStatuses = new Set([408, 429, 500, 502, 503, 504]);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs(response: Response) {
  const retryAfter = response.headers.get('Retry-After');
  if (!retryAfter) return null;
  const seconds = Number(retryAfter);
  return Number.isFinite(seconds) ? seconds * 1000 : null;
}

export class RiotClient {
  private readonly apiKey: string;

  constructor(apiKey = requirePipelineEnv('RIOT_API_KEY')) {
    this.apiKey = apiKey;
  }

  async getMatchV5<T>(region: RegionalRouting, path: string, searchParams?: Record<string, string | number | undefined>) {
    return this.getRegional<T>(region, path, searchParams);
  }

  async getAccountV1<T>(region: RegionalRouting, path: string, searchParams?: Record<string, string | number | undefined>) {
    return this.getRegional<T>(region, path, searchParams);
  }

  async getLeagueV4<T>(region: PlatformRegion, path: string, searchParams?: Record<string, string | number | undefined>) {
    return this.getPlatform<T>(region, path, searchParams);
  }

  async getSummonerV4<T>(region: PlatformRegion, path: string, searchParams?: Record<string, string | number | undefined>) {
    return this.getPlatform<T>(region, path, searchParams);
  }

  private async getRegional<T>(region: RegionalRouting, path: string, searchParams?: Record<string, string | number | undefined>) {
    const url = new URL(`https://${region}.api.riotgames.com${path}`);
    for (const [key, value] of Object.entries(searchParams ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    return this.requestJson<T>(url);
  }

  private async getPlatform<T>(region: PlatformRegion, path: string, searchParams?: Record<string, string | number | undefined>) {
    const url = new URL(`https://${region}.api.riotgames.com${path}`);
    for (const [key, value] of Object.entries(searchParams ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    return this.requestJson<T>(url);
  }

  private async requestJson<T>(url: URL, attempt = 0): Promise<T> {
    const response = await fetch(url, {
      headers: {
        'X-Riot-Token': this.apiKey,
      },
    });

    if (response.ok) return (await response.json()) as T;

    if (temporaryStatuses.has(response.status) && attempt < 5) {
      const waitMs = retryAfterMs(response) ?? Math.min(1000 * 2 ** attempt, 15000);
      await sleep(waitMs);
      return this.requestJson<T>(url, attempt + 1);
    }

    const body = await response.text();
    throw new Error(`Riot API request failed ${response.status} ${response.statusText}: ${body}`);
  }
}
