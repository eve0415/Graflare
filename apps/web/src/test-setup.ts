import { vi } from "vitest"

vi.mock("@tanstack/react-start", async () => {
  const actual = await vi.importActual("@tanstack/react-start")
  return {
    ...actual,
    createServerFn: () => {
      const fn = Object.assign(async () => null, {
        inputValidator: () => fn,
        validator: () => fn,
        handler: () => fn,
      })
      return fn
    },
  }
})
