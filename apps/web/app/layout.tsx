import type { Metadata } from 'next';
import { AppHeader } from '@/components/AppHeader';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Boardgame Crowdfunding',
    template: '%s · Boardgame Crowdfunding',
  },
  description: 'A focused crowdfunding platform for tabletop and boardgame creators.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-slate-900 antialiased">
        <AppHeader />
        {children}
      </body>
    </html>
  );
}
