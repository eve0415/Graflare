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
import { listDatasources, deleteDatasource } from "../../lib/api"
import { useState } from "react"

export const Route = createFileRoute("/datasources/")({
  loader: () => listDatasources(),
  component: DatasourceListPage,
})

interface DatasourceRow {
  id: string
  name: string
  type: string
  url: string
  authType: string
}

function DatasourceListPage() {
  const datasources = (Route.useLoaderData() ?? []) as DatasourceRow[]
  const router = useRouter()
  const [deleting, setDeleting] = useState<string | null>(null)

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      await deleteDatasource({ data: id })
      router.invalidate()
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Data Sources</h1>
        <Link to="/datasources/new">
          <Button size="sm">Add data source</Button>
        </Link>
      </div>

      {datasources.length === 0 ? (
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
            {datasources.map((ds) => (
              <TableRow key={ds.id}>
                <TableCell className="font-medium">{ds.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{ds.type}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {ds.url}
                </TableCell>
                <TableCell>{ds.authType}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Link to="/datasources/$id" params={{ id: ds.id }}>
                      <Button variant="ghost" size="xs">
                        Edit
                      </Button>
                    </Link>
                    <Link to="/datasources/$id/test" params={{ id: ds.id }}>
                      <Button variant="ghost" size="xs">
                        Test
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => handleDelete(ds.id)}
                      disabled={deleting === ds.id}
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
