import "./style.css";
export const metadata = {
  title: "DOGO · 运营工作台",
  description: "让每一次出门，都成为好时光。",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
