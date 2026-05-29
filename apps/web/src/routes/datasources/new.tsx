import { createFileRoute } from "@tanstack/react-router"
import { DatasourceForm } from "./-components/datasource-form"

const NewDatasourcePage = () => <DatasourceForm mode="create" />

export const Route = createFileRoute("/datasources/new")({
  component: NewDatasourcePage,
})
