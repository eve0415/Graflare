import type { DatasourceCredentials } from "@graflare/shared/schemas/datasource"
import { prometheusResponseSchema } from "@graflare/shared/schemas/prometheus"
import type { PrometheusResponse } from "@graflare/shared/schemas/prometheus"

interface PrometheusAuth {
  type: "none" | "basic" | "bearer"
  credentials?: DatasourceCredentials
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
      return prometheusResponseSchema.parse(await res.json())
    } catch (error) {
      return this.errorResponse(error)
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
      return prometheusResponseSchema.parse(await res.json())
    } catch (error) {
      return this.errorResponse(error)
    }
  }

  private errorResponse(error: unknown): PrometheusResponse {
    const message = error instanceof Error ? error.message : "Request failed"
    const isTimeout =
      error instanceof Error && error.name === "TimeoutError"
    return {
      status: "error",
      errorType: isTimeout ? "timeout" : "internal",
      error: isTimeout
        ? `Query timed out after ${this.timeoutMs / 1000}s`
        : message,
    }
  }
}
