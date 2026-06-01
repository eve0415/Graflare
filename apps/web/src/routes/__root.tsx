import type { QueryClient } from '@tanstack/react-query';

import { Separator } from '@graflare/ui/components/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@graflare/ui/components/sidebar';
import { Skeleton } from '@graflare/ui/components/skeleton';
import rootCss from './__root.css?url';
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';

import { AppSidebar } from '../components/app-sidebar';
import { QueryBoundary } from '../components/query-boundary';
import { ThemeProvider } from '../components/theme-provider';

const bodyStyle = { fontFamily: 'Geist, sans-serif' };
const rootFallback = <Skeleton className='h-64 w-full rounded-lg' />;

const RootComponent = () => (
  <html lang='en'>
    <head>
      <HeadContent />
    </head>
    <body className='bg-background text-foreground min-h-screen antialiased' style={bodyStyle}>
      <ThemeProvider>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <header className='flex h-12 shrink-0 items-center gap-2 border-b px-4'>
              <SidebarTrigger className='-ml-1' />
              <Separator orientation='vertical' className='mr-2 !h-4' />
              <span className='text-sm font-semibold'>Graflare</span>
            </header>
            <main className='flex-1 p-6'>
              <QueryBoundary pendingFallback={rootFallback}>
                <Outlet />
              </QueryBoundary>
            </main>
          </SidebarInset>
        </SidebarProvider>
      </ThemeProvider>
      <TanStackRouterDevtools position='bottom-right' />
      <Scripts />
    </body>
  </html>
);

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [{ charSet: 'utf8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' }, { title: 'Graflare' }],
    links: [
      { rel: 'stylesheet', href: rootCss },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap',
      },
    ],
  }),
  component: RootComponent,
});
