"use client";

import { FileWarning } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ErrorCardProps {
  error: string;
  onStartOver: () => void;
}

export function ErrorCard({ error, onStartOver }: ErrorCardProps) {
  return (
    <Card className="w-full max-w-lg shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center justify-center text-2xl text-destructive">
          <FileWarning className="mr-2 h-8 w-8" />
          An Error Occurred
        </CardTitle>
      </CardHeader>
      <CardContent className="text-center">
        <p className="text-destructive mb-4">{error}</p>
        <Button onClick={onStartOver} variant="outline">
          Start Over
        </Button>
      </CardContent>
    </Card>
  );
}