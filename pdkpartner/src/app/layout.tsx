import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PDK Partner Portal",
  description: "Partner Demo Kit - bring your own environment",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white text-gray-900 antialiased">{children}</body>
    </html>
  );
}
