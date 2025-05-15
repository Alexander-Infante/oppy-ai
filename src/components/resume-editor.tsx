"use client";

import type { RewriteResumeOutput } from '@/ai/flows/rewrite-resume';
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Download, FileText, RefreshCw, Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ResumeEditorProps {
  originalResumeText: string;
  rewrittenResumeOutput: RewriteResumeOutput;
  onStartOver: () => void;
}

export function ResumeEditor({ originalResumeText, rewrittenResumeOutput, onStartOver }: ResumeEditorProps) {
  const [editableRewrittenText, setEditableRewrittenText] = useState(rewrittenResumeOutput.rewrittenResume);
  const { toast } = useToast();

  useEffect(() => {
    setEditableRewrittenText(rewrittenResumeOutput.rewrittenResume);
  }, [rewrittenResumeOutput]);

  const handleDownload = (format: 'txt' | 'json') => {
    let content = '';
    let filename = '';
    let mimeType = '';

    if (format === 'txt') {
      content = editableRewrittenText;
      filename = 'rewritten_resume.txt';
      mimeType = 'text/plain';
    } else {
      // Download the full RewriteResumeOutput object as JSON
      content = JSON.stringify(rewrittenResumeOutput, null, 2);
      filename = 'rewritten_resume_data.json';
      mimeType = 'application/json';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: 'Download Started', description: `${filename} is downloading.`, variant: 'default' });
  };

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(editableRewrittenText)
      .then(() => {
        toast({ title: 'Copied to Clipboard!', description: 'Rewritten resume text copied.', variant: 'default' });
      })
      .catch(err => {
        toast({ title: 'Copy Failed', description: 'Could not copy text to clipboard.', variant: 'destructive' });
        console.error('Failed to copy: ', err);
      });
  };

  return (
    <Card className="w-full max-w-4xl shadow-xl">
      <CardHeader>
        <CardTitle className="text-2xl">Review & Refine Your Resume</CardTitle>
        <CardDescription>
          Compare your original resume with the AI-rewritten version. Edit the rewritten text as needed, then download.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="rewritten" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="original">Original Resume</TabsTrigger>
            <TabsTrigger value="rewritten">AI-Rewritten Resume (Editable)</TabsTrigger>
          </TabsList>
          <TabsContent value="original">
            <Card className="border-dashed">
              <CardHeader><CardTitle className="text-lg">Original Text</CardTitle></CardHeader>
              <CardContent>
                <Textarea
                  value={originalResumeText}
                  readOnly
                  rows={15}
                  className="text-sm bg-muted/50 cursor-not-allowed"
                />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="rewritten">
             <Card className="border-primary border-2">
              <CardHeader><CardTitle className="text-lg">Rewritten & Editable</CardTitle></CardHeader>
              <CardContent>
                <Textarea
                  value={editableRewrittenText}
                  onChange={(e) => setEditableRewrittenText(e.target.value)}
                  rows={15}
                  className="text-sm focus:ring-primary"
                  placeholder="Your rewritten resume will appear here..."
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        
        <div className="mt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex gap-2">
            <Button onClick={() => handleDownload('txt')} variant="outline">
              <Download className="mr-2 h-4 w-4" /> Download .txt
            </Button>
            <Button onClick={() => handleDownload('json')} variant="outline">
              <FileText className="mr-2 h-4 w-4" /> Download .json
            </Button>
             <Button onClick={handleCopyToClipboard} variant="outline">
              <Copy className="mr-2 h-4 w-4" /> Copy Text
            </Button>
          </div>
          <Button onClick={onStartOver} variant="secondary">
            <RefreshCw className="mr-2 h-4 w-4" /> Start Over
          </Button>
        </div>

      </CardContent>
    </Card>
  );
}
