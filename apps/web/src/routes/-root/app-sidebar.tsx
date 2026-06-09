import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@graflare/ui/components/sidebar';
import { Link, useLocation } from '@tanstack/react-router';

import { navItems } from './nav-items';
import { ThemeToggle } from './theme-toggle';

export const AppSidebar = () => {
  const location = useLocation();

  return (
    <Sidebar collapsible='icon'>
      {/* One navigation landmark around the entire sidebar — logo/header, nav links, theme
          toggle, rail — so all of it is programmatically grouped for assistive tech (axe
          `region`, which flags any content outside a landmark). Authored once here, it renders
          inside whichever shell the Sidebar primitive picks: the desktop rail's inner wrapper or
          the mobile Sheet. `flex size-full flex-col` keeps the column layout the slots rely on
          (notably SidebarContent's `flex-1` fill). The label is unique vs the breadcrumb `<nav
          aria-label='breadcrumb'>` in the header so axe `landmark-unique` stays clean. */}
      <nav aria-label='Primary' className='flex size-full flex-col'>
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size='lg' render={<Link to='/' />}>
                <div className='bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg text-xs font-bold'>G</div>
                <div className='flex flex-col gap-0.5 leading-none'>
                  <span className='font-semibold'>Graflare</span>
                  <span className='text-muted-foreground text-xs'>Dashboards</span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map(item => {
                  const isActive = location.pathname.startsWith(item.to);
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton isActive={isActive} tooltip={item.label} render={<Link to={item.to} />}>
                        <item.icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <div className='flex items-center justify-center p-2'>
            <ThemeToggle />
          </div>
        </SidebarFooter>

        <SidebarRail />
      </nav>
    </Sidebar>
  );
};
