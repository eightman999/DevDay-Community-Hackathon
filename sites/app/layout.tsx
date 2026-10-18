import type { Metadata } from "next";
export const metadata: Metadata = {title:"CELLWATCH",description:"病院の通信を審査するセキュリティ学習ゲーム"};
export default function RootLayout({children}: {children: React.ReactNode}) { return <html lang="ja"><body>{children}</body></html>; }
