"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, AlertCircle, Target, ArrowRight } from 'lucide-react';
import type { ScoreResumeOutput } from '@/ai/flows/score-resume';

interface ResumeScoreDisplayProps {
  scoreData: ScoreResumeOutput;
  onContinue: () => void;
  onStartOver: () => void;
  disabled?: boolean;
}

export function ResumeScoreDisplay({ scoreData, onContinue, onStartOver, disabled }: ResumeScoreDisplayProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreVariant = (score: number): "default" | "secondary" | "destructive" | "outline" => {
    if (score >= 80) return 'default';
    if (score >= 60) return 'secondary';
    return 'destructive';
  };

  return (
    <div className="space-y-6 w-full max-w-4xl">
      {/* Overall Score */}
      <Card className="shadow-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl flex items-center justify-center">
            <Target className="mr-3 h-8 w-8" />
            Resume Score
          </CardTitle>
          <CardDescription>
            Your resume has been analyzed using modern scoring techniques
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <div className={`text-6xl font-bold mb-4 ${getScoreColor(scoreData.overallScore)}`}>
            {scoreData.overallScore}/100
          </div>
          <Progress value={scoreData.overallScore} className="w-full max-w-md mx-auto mb-4" />
          <Badge variant={getScoreVariant(scoreData.overallScore)} className="text-lg px-4 py-2">
            {scoreData.overallScore >= 80 ? 'Excellent' : 
             scoreData.overallScore >= 60 ? 'Good' : 'Needs Improvement'}
          </Badge>
        </CardContent>
      </Card>

      {/* Quick Category Overview */}
      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle>Score Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(scoreData.categoryScores).slice(0, 4).map(([category, score]) => (
              <div key={category} className="text-center">
                <div className={`text-2xl font-bold ${getScoreColor(score)}`}>
                  {score}
                </div>
                <div className="text-sm text-muted-foreground capitalize">
                  {category.replace(/([A-Z])/g, ' $1').trim()}
                </div>
                <Progress value={score} className="h-2 mt-1" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Key Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center text-green-600">
              <CheckCircle className="mr-2 h-5 w-5" />
              Top Strengths
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {scoreData.strengths.slice(0, 3).map((strength, index) => (
                <li key={index} className="flex items-start">
                  <CheckCircle className="h-4 w-4 text-green-600 mr-2 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">{strength}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center text-orange-600">
              <AlertCircle className="mr-2 h-5 w-5" />
              Key Improvements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {scoreData.improvements.slice(0, 3).map((improvement, index) => (
                <li key={index} className="flex items-start">
                  <AlertCircle className="h-4 w-4 text-orange-600 mr-2 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">{improvement}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* ATS Score */}
      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle>ATS Compatibility Score</CardTitle>
          <CardDescription>How well your resume works with Applicant Tracking Systems</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-2">
            <span>ATS Score</span>
            <span className={`text-xl font-bold ${getScoreColor(scoreData.atsCompatibility)}`}>
              {scoreData.atsCompatibility}/100
            </span>
          </div>
          <Progress value={scoreData.atsCompatibility} className="mb-2" />
          <p className="text-sm text-muted-foreground">{scoreData.industryAlignment}</p>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row justify-center gap-4">
        <Button 
          onClick={onContinue} 
          disabled={disabled}
          className="flex-1 max-w-xs"
          size="lg"
        >
          Continue to AI Interview
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
        <Button 
          onClick={onStartOver} 
          variant="outline"
          className="flex-1 max-w-xs"
        >
          Try Another Resume
        </Button>
      </div>
    </div>
  );
}