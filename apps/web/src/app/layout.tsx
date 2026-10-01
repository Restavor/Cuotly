import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ToastProvider } from "@/components/ui";
import "./globals.css";

// Tipografía Inter, según la identidad visual "Emerald Control" (PRD §20.6).
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Restavor",
  description: "Restavor — el mantenimiento de la web de tu restaurante y tus agentes de inteligencia artificial.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={inter.variable}>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
