import { createFileRoute } from "@tanstack/react-router"
import { getDatasource } from "../../../lib/api"
import { DatasourceForm } from "../-components/datasource-form"

export const Route = createFileRoute("/datasources/$id/")({
  loader: ({ params }) => getDatasource({ data: params.id }),
  component: EditDatasourcePage,
})

function EditDatasourcePage() {
  const ds = Route.useLoaderData() as {
    id: string
    name: string
    type: string
    url: string
    authType: string
    queryTimeoutMs: number
  } | null

  if (!ds) {
    return <p className="text-sm text-muted-foreground">Data source not found.</p>
  }

  return (
    <DatasourceForm
      mode="edit"
      initialData={{
        id: ds.id,
        name: ds.name,
        type: ds.type,
        url: ds.url,
        authType: ds.authType,
        queryTimeoutMs: ds.queryTimeoutMs,
      }}
    />
  )
}
