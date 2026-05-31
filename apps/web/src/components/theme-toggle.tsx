import { Button } from '@graflare/ui/components/button';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useCallback } from 'react';

import { useTheme } from './theme-provider';

const icons = {
  system: Monitor,
  light: Sun,
  dark: Moon,
} as const;

const nextTheme = {
  system: 'light',
  light: 'dark',
  dark: 'system',
} as const;

const labels = {
  system: 'System theme',
  light: 'Light theme',
  dark: 'Dark theme',
} as const;

export const ThemeToggle = () => {
  const { theme, setTheme } = useTheme();
  const Icon = icons[theme];

  const handleClick = useCallback(() => {
    setTheme(nextTheme[theme]);
  }, [theme, setTheme]);

  return (
    <Button
      variant='ghost'
      size='icon'
      aria-label={labels[theme]}
      onClick={handleClick}
    >
      <Icon className='h-4 w-4' />
    </Button>
  );
};
