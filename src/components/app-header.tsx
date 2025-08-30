"use client";

import { Rocket } from "lucide-react";

export function AppHeader() {
  return (
    <header className="mb-8 text-center">
      <div className="flex items-center justify-center mb-2">
        <Rocket className="h-12 w-12 text-primary mr-3" />
        <h1 className="text-4xl font-bold tracking-tight">Oppy AI</h1>
      </div>
      <p className="text-lg text-muted-foreground">
        AI-powered resume rewriting to help you land your dream job.
      </p>
    </header>
  );
}