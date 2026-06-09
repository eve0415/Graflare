import type { QueryClient } from '@tanstack/react-query';

import { Separator } from '@graflare/ui/components/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@graflare/ui/components/sidebar';
import { Skeleton } from '@graflare/ui/components/skeleton';
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { useCallback, useState } from 'react';

import { AppSidebar } from './-root/app-sidebar';
import { Breadcrumbs } from './-root/breadcrumbs';
import { CommandPalette } from './-root/command-palette';
import { CommandPaletteTrigger } from './-root/command-palette-trigger';
import { KeyboardShortcuts } from './-root/keyboard-shortcuts';
import { QueryBoundary } from './-root/query-boundary';
import { ShortcutsHelp } from './-root/shortcuts-help';
import { ThemeProvider } from './-root/theme-provider';
import rootCss from './__root.css?url';

const bodyStyle = { fontFamily: 'Geist, sans-serif' };
const rootFallback = <Skeleton className='h-64 w-full rounded-lg' />;

const RootComponent = () => {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const openPalette = useCallback(() => {
    setPaletteOpen(true);
  }, []);

  return (
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
                <Breadcrumbs />
                <div className='ml-auto'>
                  <CommandPaletteTrigger onOpen={openPalette} />
                </div>
              </header>
              <div className='flex-1 p-6'>
                {/* Cap + center content on ultra-wide (4K/8K) displays so forms, cards and search
                    don't stretch to unreadable line lengths. 2000px is strictly greater than a
                    1920px viewport, so the ≤1920 layout is unchanged; below the cap this is a no-op.
                    The dashboard view escapes the page padding with `-m-6` but stays within this cap
                    (its panel grid reflows to the available columns either way). */}
                <div className='mx-auto w-full max-w-[2000px]'>
                  <QueryBoundary pendingFallback={rootFallback}>
                    <Outlet />
                  </QueryBoundary>
                </div>
              </div>
            </SidebarInset>
          </SidebarProvider>
          <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
          <ShortcutsHelp open={helpOpen} onOpenChange={setHelpOpen} />
          <KeyboardShortcuts />
        </ThemeProvider>
        <TanStackRouterDevtools position='bottom-right' />
        <Scripts />
      </body>
    </html>
  );
};

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [{ charSet: 'utf8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' }, { title: 'Graflare' }],
    links: [
      { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
      { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' },
      { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
      { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
      { rel: 'manifest', href: '/site.webmanifest' },
      { rel: 'stylesheet', href: rootCss },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap',
      },
    ],
  }),
  component: RootComponent,
});
