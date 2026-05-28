import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/datasources/$id/test")({
  component: QueryTestPage,
})

function QueryTestPage() {
  const { id } = Route.useParams()
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Query Test</h1>
      <p className="text-sm text-muted-foreground">
        Test queries against data source {id}
      </p>
    </div>
  )
}
