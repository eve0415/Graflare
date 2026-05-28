import { createFileRoute } from "@tanstack/react-router"
import { DatasourceForm } from "./-components/datasource-form"

export const Route = createFileRoute("/datasources/new")({
  component: NewDatasourcePage,
})

function NewDatasourcePage() {
  return <DatasourceForm mode="create" />
}
