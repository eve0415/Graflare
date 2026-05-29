import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { Button } from "@graflare/ui/components/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@graflare/ui/components/table"
import { Badge } from "@graflare/ui/components/badge"
import { deleteDatasource, listDatasources } from "../../lib/api"
import { useMemo, useState } from "react"

const DatasourceListPage = () => {
  const datasources = Route.useLoaderData()
  const router = useRouter()
  const [deleting, setDeleting] = useState<string | null>(null)

  const rows = useMemo(
    () =>
      datasources.map((ds) => ({
        id: ds.id,
        name: ds.name,
        type: ds.type,
        url: ds.url,
        authType: ds.authType,
        params: { id: ds.id },
        onDelete: () => {
          const run = async () => {
            setDeleting(ds.id)
            try {
              await deleteDatasource({ data: ds.id })
              await router.invalidate()
            } finally {
              setDeleting(null)
            }
          }
          void run()
        },
      })),
    [datasources, router],
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Data Sources</h1>
        <Link to="/datasources/new">
          <Button size="sm">Add data source</Button>
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No data sources configured yet.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>URL</TableHead>
              <TableHead>Auth</TableHead>
              <TableHead className="w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{row.type}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {row.url}
                </TableCell>
                <TableCell>{row.authType}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Link to="/datasources/$id" params={row.params}>
                      <Button variant="ghost" size="xs">
                        Edit
                      </Button>
                    </Link>
                    <Link to="/datasources/$id/test" params={row.params}>
                      <Button variant="ghost" size="xs">
                        Test
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={row.onDelete}
                      disabled={deleting === row.id}
                    >
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

export const Route = createFileRoute("/datasources/")({
  loader: () => listDatasources(),
  component: DatasourceListPage,
})
