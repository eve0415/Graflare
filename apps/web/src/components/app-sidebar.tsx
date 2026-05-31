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
import {
  Compass,
  Database,
  Import,
  LayoutDashboard,
} from 'lucide-react';

import { ThemeToggle } from './theme-toggle';

const navItems = [
  { to: '/dashboards', label: 'Dashboards', icon: LayoutDashboard },
  { to: '/explore', label: 'Explore', icon: Compass },
  { to: '/datasources', label: 'Data Sources', icon: Database },
  { to: '/import', label: 'Import', icon: Import },
] as const;

export const AppSidebar = () => {
  const location = useLocation();

  return (
    <Sidebar collapsible='icon'>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size='lg' asChild>
              <Link to='/'>
                <div className='bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg text-xs font-bold'>
                  G
                </div>
                <div className='flex flex-col gap-0.5 leading-none'>
                  <span className='font-semibold'>Graflare</span>
                  <span className='text-muted-foreground text-xs'>Dashboards</span>
                </div>
              </Link>
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
                    <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                      <Link to={item.to}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
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
    </Sidebar>
  );
};
