import { Link, createFileRoute } from "@tanstack/react-router"
import { Button } from "@graflare/ui/components/button"

export const Route = createFileRoute("/datasources/")({
  component: DatasourceListPage,
})

function DatasourceListPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Data Sources</h1>
        <Link to="/datasources/new">
          <Button size="sm">Add data source</Button>
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        No data sources configured yet.
      </p>
    </div>
  )
}
