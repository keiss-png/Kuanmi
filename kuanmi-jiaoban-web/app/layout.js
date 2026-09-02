import './globals.css';

export const metadata = {
  title: '宽米 · 交班本',
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
