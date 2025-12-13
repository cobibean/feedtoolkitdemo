import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "@/components/providers";
import { StorageModeProvider } from "@/context/storage-mode-context";

const satoshi = localFont({
  src: [
    {
      path: "../../public/brand/fonts/Satoshi-Variable.woff2",
      style: "normal",
    },
  ],
  variable: "--font-satoshi",
  display: "swap",
});

const archivoBlack = localFont({
  src: "../../public/brand/fonts/ArchivoBlack-Regular.ttf",
  variable: "--font-archivo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Flare Custom Feeds | Create FDC-Verified Price Feeds",
  description: "Deploy custom price feeds from Uniswap V3 pools on Flare Network using the Flare Data Connector",
  icons: {
    icon: "/brand/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${satoshi.variable} ${archivoBlack.variable} font-sans antialiased`}>
        <StorageModeProvider>
          <Providers>{children}</Providers>
        </StorageModeProvider>
      </body>
    </html>
  );
}
