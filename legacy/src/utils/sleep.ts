/**
 * Sleep for `ms`, or resolve early if the optional AbortSignal aborts.
 *
 * This is handy for long-running loops that should stop quickly on shutdown.
 */
export async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  if (signal?.aborted) return;

  await new Promise<void>((resolve) => {
    let onAbort: (() => void) | undefined;

    const timeout = setTimeout(() => {
      if (signal && onAbort) signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    if (!signal) return;

    onAbort = () => {
      clearTimeout(timeout);
      resolve();
    };

    signal.addEventListener("abort", onAbort, { once: true });
  });
}
