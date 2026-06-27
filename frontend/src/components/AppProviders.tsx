'use client';

import { ThemeProvider } from '@/contexts/ThemeContext';

export default function AppProviders({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
