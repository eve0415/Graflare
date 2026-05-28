import { Outlet, createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/datasources/$id")({
  component: DatasourceLayout,
})

function DatasourceLayout() {
  return <Outlet />
}
