"use client";
import { ReactNode } from "react";
import Providers from "./providers";
import "./globals.css";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
