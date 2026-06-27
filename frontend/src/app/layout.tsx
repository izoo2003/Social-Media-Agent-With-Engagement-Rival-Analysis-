'use client';

import React from 'react';
import type { ReactNode } from 'react';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { Analytics } from '@vercel/analytics/react';
import '../styles/globals.css';

interface LayoutProps {
  children: ReactNode;
}

const themeInitScript = `
(function () {
  try {
    var theme = localStorage.getItem('kafi-theme');
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.dataset.theme = 'dark';
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: LayoutProps) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Social Media Agent - Kafi Commodities</title>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
