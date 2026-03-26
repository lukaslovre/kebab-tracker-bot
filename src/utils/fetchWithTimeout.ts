/**
 * `fetch()` wrapper that enforces a timeout.
 *
 * - If `init.signal` is provided, aborts when the caller aborts.
 * - Also aborts after `timeoutMs`.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal;
  return await fetch(url, { ...init, signal });
}
