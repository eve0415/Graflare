import { createFileRoute } from "@tanstack/react-router"
import {
  datasourceAuthType,
  datasourceType,
} from "@graflare/shared/schemas/datasource"
import { useMemo } from "react"
import { getDatasource } from "../../../lib/api"
import { DatasourceForm } from "../-components/datasource-form"

const EditDatasourcePage = () => {
  const ds = Route.useLoaderData()

  const initialData = useMemo(
    () =>
      ds === null
        ? null
        : {
            id: ds.id,
            name: ds.name,
            type: datasourceType.parse(ds.type),
            url: ds.url,
            authType: datasourceAuthType.parse(ds.authType),
            queryTimeoutMs: ds.queryTimeoutMs,
          },
    [ds],
  )

  if (initialData === null) {
    return <p className="text-sm text-muted-foreground">Data source not found.</p>
  }

  return <DatasourceForm mode="edit" initialData={initialData} />
}

export const Route = createFileRoute("/datasources/$id/")({
  loader: ({ params }) => getDatasource({ data: params.id }),
  component: EditDatasourcePage,
})
