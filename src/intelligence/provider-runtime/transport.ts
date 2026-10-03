import type { ProviderError } from "../provider-sdk/error";

export interface ProviderHttpRequest {
  url: string;
  method: string;
  headers?: HeadersInit;
  body?: BodyInit | null;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export type ProviderJsonResult =
  { success: true; value: unknown } | { success: false; error: ProviderError };

// Streaming callers consume response.body directly and must call close() in finally.
export type ProviderHttpResult =
  | { success: false; error: ProviderError }
  | {
      success: true;
      status: number;
      response: Response;
      readJson(): Promise<ProviderJsonResult>;
      close(): void;
    };

const errors = {
  authentication: {
    code: "PROVIDER_AUTHENTICATION_FAILED",
    message: "Provider authentication failed",
    category: "authentication"
  },
  rateLimit: {
    code: "PROVIDER_RATE_LIMITED",
    message: "Provider rate limit exceeded",
    category: "rate_limit"
  },
  http: {
    code: "PROVIDER_HTTP_ERROR",
    message: "Provider request failed",
    category: "api_error"
  },
  timeout: {
    code: "PROVIDER_TIMEOUT",
    message: "Provider request timed out",
    category: "timeout"
  },
  network: {
    code: "PROVIDER_NETWORK_ERROR",
    message: "Provider request could not be completed",
    category: "unknown"
  },
  invalid: {
    code: "PROVIDER_INVALID_RESPONSE",
    message: "Provider returned an invalid response",
    category: "validation"
  }
} as const satisfies Record<string, ProviderError>;

// Native exceptions, request details, and response bodies never enter public errors.
export function normalizeProviderHttpStatus(status: number): ProviderError {
  if (status === 401 || status === 403) return errors.authentication;
  if (status === 429) return errors.rateLimit;
  return errors.http;
}

export async function sendProviderRequest(
  request: ProviderHttpRequest,
  fetcher: typeof fetch = globalThis.fetch
): Promise<ProviderHttpResult> {
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectAbort: ((reason: unknown) => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const onAbort = () => {
    rejectAbort?.(undefined);
  };
  const onExternalAbort = () => {
    controller.abort();
  };
  const close = () => {
    if (timer !== undefined) clearTimeout(timer);
    request.signal?.removeEventListener("abort", onExternalAbort);
    controller.signal.removeEventListener("abort", onAbort);
  };

  if (request.signal?.aborted) return { success: false, error: errors.network };
  request.signal?.addEventListener("abort", onExternalAbort, { once: true });
  controller.signal.addEventListener("abort", onAbort, { once: true });
  if (request.timeoutMs !== undefined) {
    if (!Number.isFinite(request.timeoutMs) || request.timeoutMs <= 0) {
      close();
      return { success: false, error: errors.invalid };
    }
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, request.timeoutMs);
  }

  try {
    const response = await Promise.race([
      fetcher(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        signal: controller.signal
      }),
      aborted
    ]);
    if (
      !(response instanceof Response) ||
      !Number.isInteger(response.status) ||
      response.status < 200 ||
      response.status > 599
    ) {
      close();
      return { success: false, error: errors.invalid };
    }
    if (!response.ok) {
      close();
      return {
        success: false,
        error: normalizeProviderHttpStatus(response.status)
      };
    }
    return {
      success: true,
      status: response.status,
      response,
      close,
      async readJson(): Promise<ProviderJsonResult> {
        try {
          const value: unknown = await Promise.race([response.json(), aborted]);
          return { success: true, value };
        } catch {
          return {
            success: false,
            error: timedOut ? errors.timeout : errors.invalid
          };
        } finally {
          close();
        }
      }
    };
  } catch {
    close();
    return {
      success: false,
      error: timedOut ? errors.timeout : errors.network
    };
  }
}
