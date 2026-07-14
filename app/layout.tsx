import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Graphline — Digital Investigation",
  description:
    "See the public digital footprint behind any email, phone, username, name, or domain — or scan your own. Every claim backed by public evidence.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400..700&family=Inter:wght@400..600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full bg-bg text-ink font-sans selection:bg-accent/25">
        {children}
      </body>
    </html>
  );
}
