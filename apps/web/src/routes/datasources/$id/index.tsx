import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/datasources/$id/")({
  component: EditDatasourcePage,
})

function EditDatasourcePage() {
  const { id } = Route.useParams()
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Edit Data Source</h1>
      <p className="text-sm text-muted-foreground">
        Editing data source {id}
      </p>
    </div>
  )
}
