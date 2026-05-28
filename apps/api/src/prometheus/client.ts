import type { PrometheusResponse } from "@graflare/shared/schemas/prometheus"

interface PrometheusAuth {
  type: "none" | "basic" | "bearer"
  credentials?: {
    username?: string
    password?: string
    token?: string
  }
}

export class PrometheusClient {
  constructor(
    private baseUrl: string,
    private auth: PrometheusAuth,
    private timeoutMs: number,
  ) {}

  async instantQuery(
    query: string,
    time?: number,
  ): Promise<PrometheusResponse> {
    const params: Record<string, string> = { query }
    if (time !== undefined) params.time = String(time)
    return this.post("/api/v1/query", params)
  }

  async rangeQuery(
    query: string,
    start: number,
    end: number,
    step: string,
  ): Promise<PrometheusResponse> {
    return this.post("/api/v1/query_range", {
      query,
      start: String(start),
      end: String(end),
      step,
    })
  }

  async labels(match?: string[]): Promise<PrometheusResponse> {
    const params = new URLSearchParams()
    if (match) {
      for (const m of match) params.append("match[]", m)
    }
    return this.get("/api/v1/labels", params)
  }

  async labelValues(
    label: string,
    match?: string[],
  ): Promise<PrometheusResponse> {
    const params = new URLSearchParams()
    if (match) {
      for (const m of match) params.append("match[]", m)
    }
    return this.get(`/api/v1/label/${encodeURIComponent(label)}/values`, params)
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {}
    if (this.auth.type === "basic" && this.auth.credentials) {
      const { username, password } = this.auth.credentials
      if (username && password) {
        headers["Authorization"] = `Basic ${btoa(`${username}:${password}`)}`
      }
    } else if (this.auth.type === "bearer" && this.auth.credentials?.token) {
      headers["Authorization"] = `Bearer ${this.auth.credentials.token}`
    }
    return headers
  }

  private async get(
    path: string,
    params: URLSearchParams,
  ): Promise<PrometheusResponse> {
    const url = new URL(this.baseUrl)
    url.pathname = url.pathname.replace(/\/$/, "") + path
    url.search = params.toString()

    try {
      const res = await fetch(url.toString(), {
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(this.timeoutMs),
      })
      return (await res.json()) as PrometheusResponse
    } catch (err) {
      return this.errorResponse(err)
    }
  }

  private async post(
    path: string,
    params: Record<string, string>,
  ): Promise<PrometheusResponse> {
    const url = new URL(this.baseUrl)
    url.pathname = url.pathname.replace(/\/$/, "") + path

    try {
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: {
          ...this.getHeaders(),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(params).toString(),
        signal: AbortSignal.timeout(this.timeoutMs),
      })
      return (await res.json()) as PrometheusResponse
    } catch (err) {
      return this.errorResponse(err)
    }
  }

  private errorResponse(err: unknown): PrometheusResponse {
    const message = err instanceof Error ? err.message : "Request failed"
    const isTimeout =
      err instanceof Error && err.name === "TimeoutError"
    return {
      status: "error",
      errorType: isTimeout ? "timeout" : "internal",
      error: isTimeout
        ? `Query timed out after ${this.timeoutMs / 1000}s`
        : message,
    }
  }
}
