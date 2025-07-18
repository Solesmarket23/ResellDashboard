import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/contexts/AuthContext";
import { ThemeProvider } from "@/lib/contexts/ThemeContext";
import { DeepgramContextProvider } from "@/lib/contexts/DeepgramContext";
import { PriceMonitorProvider } from "@/lib/contexts/PriceMonitorContext";
import Script from 'next/script';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Flip Flow - Reseller Dashboard",
  description: "Track your reselling business with real-time metrics and insights",
  manifest: "/manifest.json",
  themeColor: "#1a1a1a",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Sovrn Commerce JavaScript - Automatically converts links */}
        {process.env.NEXT_PUBLIC_SOVRN_API_KEY && (
          <Script
            id="sovrn-commerce"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `
                (function() {
                  var vglnk = {
                    key: '${process.env.NEXT_PUBLIC_SOVRN_API_KEY}'
                  };
                  
                  (function(d, t) {
                    var s = d.createElement(t);
                    s.type = 'text/javascript';
                    s.async = true;
                    s.src = '//cdn.viglink.com/api/vglnk.js';
                    var r = d.getElementsByTagName(t)[0];
                    r.parentNode.insertBefore(s, r);
                  }(document, 'script'));
                })();
              `
            }}
          />
        )}
      </head>
      <body className={inter.className}>
        <AuthProvider>
          <ThemeProvider>
            <PriceMonitorProvider>
              <DeepgramContextProvider>
                <div className="flex flex-col min-h-screen">
                  <main className="flex-1 pb-safe-bottom sm:pb-0">
                    {children}
                  </main>
                </div>
              </DeepgramContextProvider>
            </PriceMonitorProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}