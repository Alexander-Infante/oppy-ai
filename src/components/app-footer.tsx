"use client";

export function AppFooter() {
  return (
    <footer className="mt-12 text-center text-sm text-muted-foreground">
      <p>&copy; {new Date().getFullYear()} Oppy AI. All rights reserved.</p>
      <p>Powered by Genkit and Next.js</p>
    </footer>
  );
}