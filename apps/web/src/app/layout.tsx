import type { ReactNode } from "react";
import "../styles/globals.css";

export const metadata = {
  title: "AutoChat",
  description: "AI omnichannel sales & support",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
