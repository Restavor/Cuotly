import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Tipografía Inter, según la identidad visual "Emerald Control" definida en
// la Especificación Maestra §146.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cuotly",
  description: "Cuotly · by Restavor — gestión del mantenimiento web de restaurantes.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
