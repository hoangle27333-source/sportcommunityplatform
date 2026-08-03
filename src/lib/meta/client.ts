import { GRAPH_API_BASE } from "./constants";

/**
 * Thin Meta Graph API client (SPEC §5, §6, §9).
 *
 * - All calls go through the version-pinned GRAPH_API_BASE.
 * - Reads rate-limit headers (X-App-Usage / X-Business-Use-Case-Usage) so the
 *   worker can back off per-account.
 * - Normalizes Graph errors into a typed GraphApiError (with code/subcode) so
 *   callers can distinguish token-expiry (needs reauth) from transient errors.
 */

export interface GraphErrorBody {
  message: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

export class GraphApiError extends Error {
  readonly code?: number;
  readonly subcode?: number;
  readonly type?: string;
  readonly httpStatus: number;

  constructor(status: number, body?: GraphErrorBody) {
    super(body?.message ?? `Graph API error (HTTP ${status})`);
    this.name = "GraphApiError";
    this.httpStatus = status;
    this.code = body?.code;
    this.subcode = body?.error_subcode;
    this.type = body?.type;
  }

  /**
   * OAuth errors (code 190) and permission errors (200/10/2xx range) mean the
   * token can no longer act on behalf of the Page → mark account needs_reauth.
   */
  get isAuthError(): boolean {
    return this.code === 190 || this.code === 102 || this.code === 10;
  }

  /** Rate-limit / throttling errors → retry with backoff. */
  get isRateLimit(): boolean {
    return (
      this.code === 4 ||
      this.code === 17 ||
      this.code === 32 ||
      this.code === 613 ||
      this.httpStatus === 429
    );
  }
}

export interface RateLimitSnapshot {
  appUsage?: unknown;
  businessUseCaseUsage?: unknown;
}

export interface GraphResponse<T> {
  data: T;
  rateLimit: RateLimitSnapshot;
}

function parseRateLimit(headers: Headers): RateLimitSnapshot {
  const safeParse = (v: string | null) => {
    if (!v) return undefined;
    try {
      return JSON.parse(v);
    } catch {
      return undefined;
    }
  };
  return {
    appUsage: safeParse(headers.get("x-app-usage")),
    businessUseCaseUsage: safeParse(headers.get("x-business-use-case-usage")),
  };
}

async function request<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  params: Record<string, string>,
  init?: { body?: BodyInit; formEncoded?: Record<string, string> },
): Promise<GraphResponse<T>> {
  const url = new URL(`${GRAPH_API_BASE}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  let body = init?.body;
  const headers: Record<string, string> = {};
  if (init?.formEncoded) {
    body = new URLSearchParams(init.formEncoded).toString();
    headers["content-type"] = "application/x-www-form-urlencoded";
  }

  const res = await fetch(url.toString(), { method, body, headers });
  const rateLimit = parseRateLimit(res.headers);

  const json = (await res.json().catch(() => ({}))) as {
    error?: GraphErrorBody;
  } & T;

  if (!res.ok || json.error) {
    throw new GraphApiError(res.status, json.error);
  }
  return { data: json as T, rateLimit };
}

export const graph = {
  get: <T>(path: string, params: Record<string, string>) =>
    request<T>("GET", path, params),
  post: <T>(
    path: string,
    params: Record<string, string>,
    formEncoded?: Record<string, string>,
  ) => request<T>("POST", path, params, { formEncoded }),
  delete: <T>(path: string, params: Record<string, string>) =>
    request<T>("DELETE", path, params),
};
