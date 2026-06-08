'use client';

import React from 'react';
import type { ReactNode } from 'react';
import '../styles/globals.css';

interface LayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: LayoutProps) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Social Media Agent - Kafi Commodities</title>
      </head>
      <body className="bg-gray-50">
        {children}
      </body>
    </html>
  );
}
