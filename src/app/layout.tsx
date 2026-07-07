import type { Metadata } from "next";
import "./globals.css";
import Navbar from "../components/Navbar";

export const metadata: Metadata = {
  title: "Sumplus Arsenal - Skills Marketplace for AI Agents",
  description: "Discover, share, and deploy skills for AI agents. The premier marketplace for AI capabilities.",
  icons: {
    icon: "/logo_blue.svg",
    apple: "/logo_blue.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#0a0f1e] text-slate-100 min-h-screen">
        <Navbar />
        <main>{children}</main>
      </body>
    </html>
  );
}