import { Link, Outlet, createFileRoute, useLocation } from '@tanstack/react-router';

const tabs = [
  { to: '/alerting/rules', label: 'Alert Rules' },
  { to: '/alerting/alerts', label: 'Alerts' },
  { to: '/alerting/notifications', label: 'Notifications' },
  { to: '/alerting/silences', label: 'Silences' },
  { to: '/alerting/mute-timings', label: 'Mute Timings' },
] as const;

const AlertingLayout = () => {
  const location = useLocation();
  return (
    <div className='flex flex-col gap-6'>
      <div>
        <h1 className='text-2xl font-bold'>Alerting</h1>
        <nav className='mt-4 flex gap-1 overflow-x-auto border-b'>
          {tabs.map(tab => {
            const isActive = location.pathname.startsWith(tab.to);
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                  isActive ? 'border-primary text-foreground' : 'text-muted-foreground hover:text-foreground border-transparent'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <Outlet />
    </div>
  );
};

export const Route = createFileRoute('/alerting')({
  component: AlertingLayout,
});
