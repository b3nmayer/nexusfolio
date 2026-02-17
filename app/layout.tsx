import './globals.css';

export const metadata = {
  title: 'FolioAnalyzer',
  description: 'Portfolio Analyzer',
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
