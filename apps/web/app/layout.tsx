import './globals.css';

export const metadata = {
  title: 'Broker Software — Dashboard',
  description: 'Exception-first broker dashboard (mock)',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen text-slate-900">{children}</body>
    </html>
  );
}
