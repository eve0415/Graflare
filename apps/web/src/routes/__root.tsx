/// <reference types="vite/client" />
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools"
import globalsCss from "@graflare/ui/globals.css?url"

const bodyStyle = { fontFamily: "Geist, sans-serif" }
const navActiveProps = { className: "text-foreground" }

const RootComponent = () => (
  <html lang="en">
    <head>
      <HeadContent />
    </head>
    <body
      className="bg-background text-foreground min-h-screen antialiased"
      style={bodyStyle}
    >
      <header className="border-b border-border">
        <div className="mx-auto flex h-12 max-w-5xl items-center gap-4 px-4">
          <Link to="/" className="text-sm font-semibold">
            Graflare
          </Link>
          <nav className="flex gap-3">
            <Link
              to="/datasources"
              className="text-sm text-muted-foreground hover:text-foreground"
              activeProps={navActiveProps}
            >
              Data Sources
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
      <TanStackRouterDevtools position="bottom-right" />
      <Scripts />
    </body>
  </html>
)

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Graflare" },
    ],
    links: [
      { rel: "stylesheet", href: globalsCss },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap",
      },
    ],
  }),
  component: RootComponent,
})
