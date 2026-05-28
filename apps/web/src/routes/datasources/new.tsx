import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/datasources/new")({
  component: NewDatasourcePage,
})

function NewDatasourcePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Add Data Source</h1>
      <p className="text-sm text-muted-foreground">
        Configure a new data source connection.
      </p>
    </div>
  )
}
