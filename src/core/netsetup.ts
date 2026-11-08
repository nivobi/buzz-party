// The box's WiFi setup service (buzz-netsetup, outside this repo) publishes its
// state on http://127.0.0.1:8431/status. Anything but a clean answer means
// "no setup going on", so the app behaves exactly as without the service.

export type WifiError = 'wrong_password' | 'not_found' | 'timeout';

export type WifiView = {
  /** waiting = no network yet, the box is looking for a remembered one (before setup starts). */
  mode: 'waiting' | 'hotspot' | 'joining' | 'connected';
  /** The network being joined or that failed; null while just waiting for a phone. */
  ssid: string | null;
  error: WifiError | null;
  /** The setup hotspot's name, for the TV text. */
  hotspotSsid: string;
};

export const NETSETUP_URL = 'http://127.0.0.1:8431/status';
const SHOWN = new Set(['waiting', 'hotspot', 'joining', 'connected']);
const ERRORS = new Set(['wrong_password', 'not_found', 'timeout']);

export async function fetchNetsetup(
  fetchFn: typeof fetch = fetch,
  url = NETSETUP_URL,
  timeoutMs = 1000,
): Promise<WifiView | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, { signal: ctl.signal, cache: 'no-store' });
    if (!res.ok) return null;
    const s: unknown = await res.json();
    if (typeof s !== 'object' || s === null || Array.isArray(s)) return null;
    const o = s as Record<string, unknown>;
    if (typeof o.mode !== 'string' || !SHOWN.has(o.mode)) return null;
    return {
      mode: o.mode as WifiView['mode'],
      ssid: typeof o.ssid === 'string' ? o.ssid : null,
      error: typeof o.error === 'string' && ERRORS.has(o.error) ? (o.error as WifiError) : null,
      hotspotSsid: typeof o.hotspot_ssid === 'string' && o.hotspot_ssid ? o.hotspot_ssid : 'BuzzParty-Setup',
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
