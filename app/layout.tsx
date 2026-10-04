import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import Header from "@/components/header";
import { GoldGradientDefs } from "@/components/trophy-icons";
import { getAwardTypes } from "@/lib/data/league";
import "./globals.css";

// variable width axis drives the expanded headings and condensed rank numbers
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "YOFHL DB",
  description: "An interactive webapp that lets you make queries to the YOFHL database.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const awards = await getAwardTypes();
  return (
    <html lang="en">
      <body className={`${archivo.variable} min-h-screen overflow-x-hidden bg-ice font-sans text-ink antialiased`}>
        <GoldGradientDefs />
        <Header awards={awards} />
        {children}
      </body>
    </html>
  );
}
