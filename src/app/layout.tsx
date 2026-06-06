import type { Metadata } from "next";
import "./globals.css";
import { AppProvider } from "@/lib/store";
import { Toast } from "@/components/Toast";

export const metadata: Metadata = {
  title: "Дашборд капитала",
  description: "Дашборд личного и корпоративного капитала",
};

/* Applies persisted theme before first paint to avoid a flash. */
const themeScript = `(function(){try{var t=localStorage.getItem('cap-theme');if(t)document.body.setAttribute('data-theme',t);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <AppProvider>
          {children}
          <Toast />
        </AppProvider>
      </body>
    </html>
  );
}
