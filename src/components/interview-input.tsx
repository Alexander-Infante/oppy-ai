"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Send, Loader2 } from 'lucide-react';

interface InterviewInputProps {
  onSubmit: (data: string) => void;
  disabled?: boolean;
}

export function InterviewInput({ onSubmit, disabled }: InterviewInputProps) {
  const [insights, setInsights] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = () => {
    if (disabled || !insights.trim()) return;
    setIsSubmitting(true);
    onSubmit(insights);
    // Parent component will handle setIsSubmitting(false) by changing step/isLoading
  };

  return (
    <Card className="w-full max-w-2xl shadow-xl">
      <CardHeader>
        <CardTitle className="text-2xl">Interview Insights</CardTitle>
        <CardDescription>
          Provide any key insights, feedback, or specific points from your (simulated) interview. 
          This will help the AI tailor the resume rewrite. For example, mention specific skills to emphasize or projects to highlight.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid w-full gap-1.5">
          <Label htmlFor="interview-insights">Your Insights</Label>
          <Textarea
            id="interview-insights"
            placeholder="e.g., Emphasize leadership skills from the X project, highlight experience with Y technology, mention Z achievement..."
            value={insights}
            onChange={(e) => setInsights(e.target.value)}
            rows={8}
            disabled={disabled || isSubmitting}
            className="text-base"
          />
        </div>
      </CardContent>
      <CardFooter>
        <Button 
          onClick={handleSubmit} 
          disabled={!insights.trim() || disabled || isSubmitting} 
          className="w-full"
          size="lg"
        >
          {isSubmitting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
             <Send className="mr-2 h-4 w-4" />
          )}
          {isSubmitting ? 'Processing...' : 'Submit Insights & Rewrite Resume'}
        </Button>
      </CardFooter>
    </Card>
  );
}
