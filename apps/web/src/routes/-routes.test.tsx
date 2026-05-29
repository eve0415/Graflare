import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from "@tanstack/react-router"
import { routeTree } from "../routeTree.gen"

afterEach(cleanup)

const renderWithRouter = async (initialUrl: string) => {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialUrl] }),
  })
  await router.load()
  render(<RouterProvider router={router} />)
}

describe("routes", () => {
  it("renders datasource list at /datasources", async () => {
    await renderWithRouter("/datasources")
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Data Sources" })).toBeDefined()
    })
  })

  it("renders add data source form at /datasources/new", async () => {
    await renderWithRouter("/datasources/new")
    await waitFor(() => {
      expect(screen.getByText("Add Data Source")).toBeDefined()
      expect(screen.getByLabelText("Name")).toBeDefined()
    })
  })

  it("renders edit page at /datasources/:id", async () => {
    await renderWithRouter("/datasources/test-id-123")
    await waitFor(() => {
      expect(screen.getByText("Data source not found.")).toBeDefined()
    })
  })

  it("renders query test page at /datasources/:id/test", async () => {
    await renderWithRouter("/datasources/test-id-123/test")
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Query Test" })).toBeDefined()
    })
  })
})
