import './globals.css';

export const metadata = {
  title: 'NexusFolio',
  description: 'Portfolio Analyzer & Correlation Terminal',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
