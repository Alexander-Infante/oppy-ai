"use client";

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input'; // Not directly used for dropzone, but for consistency
import { UploadCloud, FileText, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ResumeUploaderProps {
  onUpload: (file: File, textContent: string, dataUri: string) => void;
  disabled?: boolean;
}

export function ResumeUploader({ onUpload, disabled }: ResumeUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles && acceptedFiles.length > 0) {
      const selectedFile = acceptedFiles[0];
      if (selectedFile.type === 'text/plain' || selectedFile.name.endsWith('.txt')) {
        setFile(selectedFile);
        setError(null);
      } else {
        setError('Invalid file type. Please upload a .txt file.');
        toast({
          title: 'Invalid File Type',
          description: 'Please upload a .txt file. PDF/DOCX support is limited for rewriting.',
          variant: 'destructive',
        });
        setFile(null);
      }
    }
  }, [toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/plain': ['.txt'] },
    multiple: false,
    disabled: disabled || isProcessing,
  });

  const handleSubmit = async () => {
    if (!file) {
      setError('Please select a file first.');
      return;
    }
    setIsProcessing(true);
    setError(null);

    try {
      const textContent = await file.text();
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const dataUri = event.target.result as string;
          onUpload(file, textContent, dataUri);
        } else {
          throw new Error("Failed to read file as data URI.");
        }
      };
      reader.onerror = () => {
         throw new Error("Error reading file.");
      }
      reader.readAsDataURL(file);
    } catch (e: any) {
      console.error("Error processing file: ", e);
      setError(`Error processing file: ${e.message}`);
      toast({
        title: 'File Processing Error',
        description: e.message || 'Could not process the uploaded file.',
        variant: 'destructive',
      });
      setIsProcessing(false);
    }
    // setIsProcessing(false) will be called by parent component effectively by changing step
  };

  return (
    <Card className="w-full max-w-lg shadow-xl">
      <CardHeader>
        <CardTitle className="text-2xl">Upload Your Resume</CardTitle>
        <CardDescription>
          Please upload your resume as a <strong>.txt</strong> file. 
          This ensures accurate parsing and rewriting.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          {...getRootProps()}
          className={`p-8 border-2 border-dashed rounded-md cursor-pointer text-center transition-colors
            ${isDragActive ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/70'}
            ${(disabled || isProcessing) ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <input {...getInputProps()} />
          <UploadCloud className="mx-auto h-12 w-12 text-muted-foreground mb-2" />
          {isDragActive ? (
            <p className="text-primary">Drop the file here...</p>
          ) : (
            <p className="text-muted-foreground">Drag & drop your .txt resume here, or click to select</p>
          )}
        </div>
        {file && (
          <div className="flex items-center justify-center p-3 bg-muted rounded-md text-sm">
            <FileText className="h-5 w-5 mr-2 text-primary" />
            <span>Selected: {file.name}</span>
          </div>
        )}
        {error && <p className="text-sm text-destructive text-center">{error}</p>}
      </CardContent>
      <CardFooter>
        <Button
          onClick={handleSubmit}
          disabled={!file || disabled || isProcessing}
          className="w-full"
          size="lg"
        >
          {isProcessing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <UploadCloud className="mr-2 h-4 w-4" />
          )}
          {isProcessing ? 'Processing...' : 'Upload & Parse'}
        </Button>
      </CardFooter>
    </Card>
  );
}
