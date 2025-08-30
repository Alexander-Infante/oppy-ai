"use client";

import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface LoadingCardProps {
  message: string;
  progress: number;
}

export function LoadingCard({ message, progress }: LoadingCardProps) {
  return (
    <Card className="w-full max-w-lg shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center justify-center text-2xl">
          <Loader2 className="mr-2 h-8 w-8 animate-spin text-primary" />
          Processing...
        </CardTitle>
      </CardHeader>
      <CardContent className="text-center">
        <p className="text-muted-foreground mb-4">{message}</p>
        <Progress value={progress} className="w-full" />
        <p className="text-sm text-muted-foreground mt-2">{progress}%</p>
      </CardContent>
    </Card>
  );
}