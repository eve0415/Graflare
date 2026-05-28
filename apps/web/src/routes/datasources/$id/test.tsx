import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { Button } from "@graflare/ui/components/button"
import { Input } from "@graflare/ui/components/input"
import { Label } from "@graflare/ui/components/label"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@graflare/ui/components/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@graflare/ui/components/select"
import { Alert, AlertDescription } from "@graflare/ui/components/alert"
import { proxyQuery } from "../../../lib/api"

export const Route = createFileRoute("/datasources/$id/test")({
  component: QueryTestPage,
})

function QueryTestPage() {
  const { id } = Route.useParams()
  const [query, setQuery] = useState("up")
  const [queryType, setQueryType] = useState<"instant" | "range">("instant")
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [step, setStep] = useState("15s")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<unknown>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const endpoint =
        queryType === "instant" ? "/api/v1/query" : "/api/v1/query_range"

      const params: Record<string, string> = { query }
      if (queryType === "range") {
        params.start = start || String(Math.floor(Date.now() / 1000) - 3600)
        params.end = end || String(Math.floor(Date.now() / 1000))
        params.step = step
      }

      const res = await proxyQuery({
        data: { datasourceId: id, endpoint, params },
      })
      setResult(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Query failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Query Test</h1>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">PromQL Query</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="query">Query</Label>
              <textarea
                id="query"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex min-h-[80px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{ fontFamily: "Geist Mono, monospace" }}
                placeholder="up"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="queryType">Query Type</Label>
              <Select
                value={queryType}
                onValueChange={(v) =>
                  setQueryType(v as "instant" | "range")
                }
              >
                <SelectTrigger id="queryType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="instant">Instant</SelectItem>
                  <SelectItem value="range">Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {queryType === "range" && (
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="start">Start (unix)</Label>
                  <Input
                    id="start"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                    placeholder={String(
                      Math.floor(Date.now() / 1000) - 3600,
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end">End (unix)</Label>
                  <Input
                    id="end"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                    placeholder={String(Math.floor(Date.now() / 1000))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="step">Step</Label>
                  <Input
                    id="step"
                    value={step}
                    onChange={(e) => setStep(e.target.value)}
                    placeholder="15s"
                  />
                </div>
              </div>
            )}

            <Button type="submit" disabled={loading || !query.trim()}>
              {loading ? "Running..." : "Run Query"}
            </Button>
          </CardContent>
        </Card>
      </form>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Result</CardTitle>
          </CardHeader>
          <CardContent>
            <pre
              className="overflow-auto rounded-lg bg-muted p-4 text-xs"
              style={{ fontFamily: "Geist Mono, monospace" }}
            >
              {JSON.stringify(result, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
