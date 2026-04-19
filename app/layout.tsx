import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StudyMD – Markdown Study App",
  description: "Study markdown files with voice Q&A, progress tracking, and interview prep",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-900 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
