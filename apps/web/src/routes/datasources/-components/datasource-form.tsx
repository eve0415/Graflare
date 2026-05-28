import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Button } from "@graflare/ui/components/button"
import { Input } from "@graflare/ui/components/input"
import { Label } from "@graflare/ui/components/label"
import {
  Card,
  CardContent,
  CardFooter,
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
import {
  createDatasource,
  updateDatasource,
  testConnection,
} from "../../../lib/api"

interface DatasourceFormData {
  id?: string
  name: string
  type: string
  url: string
  authType: string
  queryTimeoutMs: number
  username?: string
  password?: string
  token?: string
}

interface Props {
  mode: "create" | "edit"
  initialData?: DatasourceFormData
}

export function DatasourceForm({ mode, initialData }: Props) {
  const navigate = useNavigate()
  const [form, setForm] = useState<DatasourceFormData>(
    initialData ?? {
      name: "",
      type: "prometheus",
      url: "",
      authType: "none",
      queryTimeoutMs: 30000,
    },
  )
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    success: boolean
    latencyMs?: number
    error?: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  function update(field: string, value: string | number) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const credentials =
        form.authType === "basic"
          ? { username: form.username, password: form.password }
          : form.authType === "bearer"
            ? { token: form.token }
            : undefined

      if (mode === "create") {
        await createDatasource({
          data: {
            name: form.name,
            type: form.type as "prometheus",
            url: form.url,
            authType: form.authType as "none" | "basic" | "bearer",
            queryTimeoutMs: form.queryTimeoutMs,
            credentials,
          },
        })
      } else if (form.id) {
        await updateDatasource({
          data: {
            id: form.id,
            data: {
              name: form.name,
              type: form.type as "prometheus",
              url: form.url,
              authType: form.authType as "none" | "basic" | "bearer",
              queryTimeoutMs: form.queryTimeoutMs,
              credentials,
            },
          },
        })
      }
      navigate({ to: "/datasources" })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    if (!form.id) return
    setTesting(true)
    setTestResult(null)
    try {
      const result = await testConnection({ data: form.id })
      setTestResult(result)
    } catch (err) {
      setTestResult({
        success: false,
        error: err instanceof Error ? err.message : "Test failed",
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>
            {mode === "create" ? "Add Data Source" : "Edit Data Source"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => update("name", e.target.value)}
              placeholder="Production Prometheus"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Type</Label>
            <Select
              value={form.type}
              onValueChange={(v: string | null) => v && update("type", v)}
            >
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="prometheus">Prometheus</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="url">URL</Label>
            <Input
              id="url"
              type="url"
              value={form.url}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => update("url", e.target.value)}
              placeholder="https://prometheus.example.com"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="authType">Authentication</Label>
            <Select
              value={form.authType}
              onValueChange={(v: string | null) => v && update("authType", v)}
            >
              <SelectTrigger id="authType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="basic">Basic Auth</SelectItem>
                <SelectItem value="bearer">Bearer Token</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.authType === "basic" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={form.username ?? ""}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => update("username", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={form.password ?? ""}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => update("password", e.target.value)}
                />
              </div>
            </>
          )}

          {form.authType === "bearer" && (
            <div className="space-y-2">
              <Label htmlFor="token">Token</Label>
              <Input
                id="token"
                type="password"
                value={form.token ?? ""}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => update("token", e.target.value)}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="timeout">Query Timeout (ms)</Label>
            <Input
              id="timeout"
              type="number"
              min={1000}
              max={120000}
              step={1000}
              value={form.queryTimeoutMs}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                update("queryTimeoutMs", Number.parseInt(e.target.value, 10))
              }
            />
          </div>

          {mode === "edit" && (
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTest}
                disabled={testing}
              >
                {testing ? "Testing..." : "Test Connection"}
              </Button>
              {testResult && (
                <span
                  className={`text-sm ${testResult.success ? "text-green-600" : "text-destructive"}`}
                >
                  {testResult.success
                    ? `Connected (${testResult.latencyMs}ms)`
                    : testResult.error}
                </span>
              )}
            </div>
          )}
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate({ to: "/datasources" })}
          >
            Cancel
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}
