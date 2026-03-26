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
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error("Request timed out")),
    timeoutMs,
  );

  let onAbort: (() => void) | undefined;

  if (init.signal) {
    if (init.signal.aborted) {
      controller.abort(init.signal.reason);
    } else {
      onAbort = () => {
        controller.abort(init.signal?.reason);
      };
      init.signal.addEventListener("abort", onAbort, { once: true });
    }
  }

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    if (init.signal && onAbort) {
      init.signal.removeEventListener("abort", onAbort);
    }
  }
}
