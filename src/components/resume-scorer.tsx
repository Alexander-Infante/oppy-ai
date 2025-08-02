"use client";

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { UploadCloud, FileText, Loader2, TrendingUp, CheckCircle, AlertCircle, Target } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { ScoreResumeInput, ScoreResumeOutput } from '@/ai/flows/score-resume';
import { scoreResume } from '@/ai/flows/score-resume';

interface ResumeScorerProps {
  className?: string;
}

export function ResumeScorer({ className }: ResumeScorerProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [scoreData, setScoreData] = useState<ScoreResumeOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles && acceptedFiles.length > 0) {
      const selectedFile = acceptedFiles[0];
      if (selectedFile.type === 'text/plain' || selectedFile.name.endsWith('.txt') || 
          selectedFile.type === 'application/pdf' || selectedFile.name.endsWith('.pdf')) {
        setFile(selectedFile);
        setError(null);
        setScoreData(null);
      } else {
        setError('Invalid file type. Please upload a .txt or .pdf file.');
        toast({
          title: 'Invalid File Type',
          description: 'Please upload a .txt or .pdf file.',
          variant: 'destructive',
        });
        setFile(null);
      }
    }
  }, [toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 
      'text/plain': ['.txt'],
      'application/pdf': ['.pdf'] 
    },
    multiple: false,
    disabled: isAnalyzing,
  });

  const handleAnalyze = async () => {
    if (!file) {
      setError('Please select a file first.');
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        if (event.target?.result) {
          const dataUri = event.target.result as string;
          try {
            const input: ScoreResumeInput = { resumeDataUri: dataUri };
            const result = await scoreResume(input);
            setScoreData(result);
            toast({
              title: "Analysis Complete!",
              description: `Your resume scored ${result.overallScore}/100`,
              variant: "default"
            });
          } catch (e: any) {
            console.error("Error analyzing resume:", e);
            setError(`Analysis failed: ${e.message}`);
            toast({
              title: 'Analysis Failed',
              description: e.message || 'Could not analyze the resume.',
              variant: 'destructive',
            });
          }
        }
        setIsAnalyzing(false);
      };
      reader.onerror = () => {
        setError("Error reading file.");
        setIsAnalyzing(false);
      };
      reader.readAsDataURL(file);
    } catch (e: any) {
      console.error("Error processing file:", e);
      setError(`Error processing file: ${e.message}`);
      setIsAnalyzing(false);
    }
  };

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

  const resetAnalysis = () => {
    setFile(null);
    setScoreData(null);
    setError(null);
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Upload Section */}
      {!scoreData && (
        <Card className="w-full max-w-2xl shadow-xl">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center">
              <TrendingUp className="mr-2 h-6 w-6" />
              Resume Scorer
            </CardTitle>
            <CardDescription>
              Get an AI-powered analysis of your resume with a comprehensive score and actionable feedback.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              {...getRootProps()}
              className={`p-8 border-2 border-dashed rounded-md cursor-pointer text-center transition-colors
                ${isDragActive ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/70'}
                ${isAnalyzing ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <input {...getInputProps()} />
              <UploadCloud className="mx-auto h-12 w-12 text-muted-foreground mb-2" />
              {isDragActive ? (
                <p className="text-primary">Drop the file here...</p>
              ) : (
                <p className="text-muted-foreground">
                  Drag & drop your .txt or .pdf resume here, or click to select
                </p>
              )}
            </div>

            {file && (
              <div className="flex items-center justify-center p-3 bg-muted rounded-md text-sm">
                <FileText className="h-5 w-5 mr-2 text-primary" />
                <span>Selected: {file.name}</span>
              </div>
            )}

            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                <p className="text-sm text-destructive text-center">{error}</p>
              </div>
            )}

            <Button
              onClick={handleAnalyze}
              disabled={!file || isAnalyzing}
              className="w-full"
              size="lg"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing Resume...
                </>
              ) : (
                <>
                  <TrendingUp className="mr-2 h-4 w-4" />
                  Analyze Resume
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Results Section */}
      {scoreData && (
        <div className="space-y-6 w-full max-w-4xl">
          {/* Overall Score */}
          <Card className="shadow-xl">
            <CardHeader className="text-center">
              <CardTitle className="text-3xl flex items-center justify-center">
                <Target className="mr-3 h-8 w-8" />
                Overall Score
              </CardTitle>
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

          {/* Category Scores */}
          <Card className="shadow-xl">
            <CardHeader>
              <CardTitle>Score Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(scoreData.categoryScores).map(([category, score]) => (
                  <div key={category} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="capitalize font-medium">
                        {category.replace(/([A-Z])/g, ' $1').trim()}
                      </span>
                      <span className={`font-bold ${getScoreColor(score)}`}>
                        {score}/100
                      </span>
                    </div>
                    <Progress value={score} className="h-2" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* ATS Compatibility */}
          <Card className="shadow-xl">
            <CardHeader>
              <CardTitle className="flex items-center">
                <CheckCircle className="mr-2 h-5 w-5" />
                ATS Compatibility
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-4">
                <span>Applicant Tracking System Score</span>
                <span className={`text-2xl font-bold ${getScoreColor(scoreData.atsCompatibility)}`}>
                  {scoreData.atsCompatibility}/100
                </span>
              </div>
              <Progress value={scoreData.atsCompatibility} className="mb-2" />
              <p className="text-sm text-muted-foreground">
                {scoreData.industryAlignment}
              </p>
            </CardContent>
          </Card>

          {/* Strengths and Improvements */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="shadow-xl">
              <CardHeader>
                <CardTitle className="flex items-center text-green-600">
                  <CheckCircle className="mr-2 h-5 w-5" />
                  Strengths
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {scoreData.strengths.map((strength, index) => (
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
                  Areas for Improvement
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {scoreData.improvements.map((improvement, index) => (
                    <li key={index} className="flex items-start">
                      <AlertCircle className="h-4 w-4 text-orange-600 mr-2 mt-0.5 flex-shrink-0" />
                      <span className="text-sm">{improvement}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Recommendations */}
          <Card className="shadow-xl">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Target className="mr-2 h-5 w-5" />
                Actionable Recommendations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {scoreData.recommendations.map((recommendation, index) => (
                  <li key={index} className="flex items-start">
                    <div className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold mr-3 mt-0.5 flex-shrink-0">
                      {index + 1}
                    </div>
                    <span className="text-sm">{recommendation}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex justify-center space-x-4">
            <Button onClick={resetAnalysis} variant="outline">
              Analyze Another Resume
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}