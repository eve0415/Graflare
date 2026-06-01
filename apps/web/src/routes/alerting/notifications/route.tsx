import { Link, Outlet, createFileRoute, useLocation } from '@tanstack/react-router';

const subtabs = [
  { to: '/alerting/notifications/contact-points', label: 'Contact Points' },
  { to: '/alerting/notifications/policies', label: 'Notification Policies' },
] as const;

const NotificationsLayout = () => {
  const location = useLocation();
  return (
    <div className='flex flex-col gap-4'>
      <div className='flex gap-2'>
        {subtabs.map(tab => {
          const isActive = location.pathname.startsWith(tab.to);
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
      <Outlet />
    </div>
  );
};

export const Route = createFileRoute('/alerting/notifications')({
  component: NotificationsLayout,
});
