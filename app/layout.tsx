import type { Metadata } from "next";
import localFont from "next/font/local";
import Header from "@/components/header";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "YOFHL DB",
  description: "An interactive webapp that lets you make queries to the YOFHL database.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-transparent overflow-x-hidden`}
      >
        <div className="lg:w-full bg-transparent">
          <Header />
        </div>
        <div className="bg-sky-100 absolute overflow-hidden -z-10 top-[8rem] h-full w-full rounded-full blur-[10rem]"></div>
        {children}
      </body>
    </html>
  );
}

