import type { Metadata } from "next";
import { BiDiToaster } from "@/components/providers/bidi-toaster";
import { LanguageProvider } from "@/components/providers/language-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smart Study — BGU",
  description:
    "Optimize your study schedule with flexible blocks and daily progress tracking.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="max-md:overflow-x-hidden max-md:w-full">
        <ThemeProvider>
          <LanguageProvider>
            {children}
            <BiDiToaster />
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
