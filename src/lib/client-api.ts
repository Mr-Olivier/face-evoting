// Browser-side fetch wrapper that turns API errors into a typed ApiError.

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public hint?: string,
    public fieldErrors: Record<string, string> = {},
    public data: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export async function callApi<T = Record<string, unknown>>(url: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError("NETWORK", "We couldn't reach the server.", 0, "Check your internet connection and try again.");
  }
  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    /* non-JSON response */
  }
  if (!res.ok) {
    throw new ApiError(
      String(data.code ?? "ERROR"),
      String(data.error ?? `Something went wrong (HTTP ${res.status}).`),
      res.status,
      typeof data.hint === "string" ? data.hint : res.status >= 500 ? "Please try again in a moment. If it keeps happening, contact the election officer." : undefined,
      (data.fieldErrors as Record<string, string>) ?? {},
      data,
    );
  }
  return data as T;
}
