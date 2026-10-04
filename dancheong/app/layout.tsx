import type { Metadata, Viewport } from "next";

import "./globals.css";
import "./dancheong-studio.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://relay-novel-nexus.juno12345.chatgpt.site"),
  applicationName: "단청",
  title: "단청 — Canon-Safe Story Engine",
  description:
    "Claude식 봉인 상태기계와 Relay Novel의 서버 검증을 결합한 인터랙티브 소설 엔진",
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "단청",
    description: "사건 순서는 단단하게, 선택과 세계는 살아 있게.",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "단청",
    description: "Canon-Safe Interactive Story Engine",
    images: ["/og.png"],
  },
  icons: {
    icon: [{ url: "/favicon.svg?v=1.12.18", type: "image/svg+xml" }, { url: "/icons/dancheong-32.png?v=1.12.18", sizes: "32x32", type: "image/png" }],
    shortcut: "/favicon.svg?v=1.12.18",
    apple: [{ url: "/icons/apple-touch-icon.png?v=1.12.18", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "단청",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  // The pinned Vinext ViewportHead omits viewportFit. Emit the complete tag
  // below and suppress its default width/scale tag so Safari sees one viewport.
  width: undefined,
  initialScale: undefined,
  themeColor: "#0B1714",
  colorScheme: "light dark",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body>{children}</body>
    </html>
  );
}
