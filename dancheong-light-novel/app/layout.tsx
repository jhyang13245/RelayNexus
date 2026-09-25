import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "단청 라이트노벨",
  description: "너름의 단청 작품을 비주얼노벨 화면에서 이어가는 라이트노벨 시뮬레이터",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
