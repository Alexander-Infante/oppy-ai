'use server';
/**
 * @fileOverview This file contains the Genkit flow for rewriting a resume based on interview insights.
 *
 * - rewriteResume - A function that accepts a resume and interview data, then rewrites the resume.
 * - RewriteResumeInput - The input type for the rewriteResume function.
 * - RewriteResumeOutput - The return type for the rewriteResume function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const RewriteResumeInputSchema = z.object({
  resumeDataUri: z
    .string()
    .describe(
      "The original resume file, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
  interviewData: z
    .string()
    .describe('Data from the voice interview, to be used to rewrite the resume.'),
});
export type RewriteResumeInput = z.infer<typeof RewriteResumeInputSchema>;

const RewriteResumeOutputSchema = z.object({
  rewrittenResume: z
    .string()
    .describe('The rewritten resume content, optimized for ATS.'),
});
export type RewriteResumeOutput = z.infer<typeof RewriteResumeOutputSchema>;

export async function rewriteResume(input: RewriteResumeInput): Promise<RewriteResumeOutput> {
  return rewriteResumeFlow(input);
}

const prompt = ai.definePrompt({
  name: 'rewriteResumePrompt',
  input: {schema: RewriteResumeInputSchema},
  output: {schema: RewriteResumeOutputSchema},
  prompt: `You are an expert resume writer specializing in applicant tracking system (ATS) optimization.

  Based on the provided resume and interview data, rewrite the resume to increase its chances of passing through screening software.

  Original Resume:
  {{media url=resumeDataUri}}

  Interview Data:
  {{interviewData}}

  Rewrite the resume to be more effective for ATS systems. Focus on incorporating relevant keywords and formatting the resume for optimal parsing.
  Make sure to include all the original information, and that no content from the original resume is lost.
  Output only the rewritten resume.`,
});

const rewriteResumeFlow = ai.defineFlow(
  {
    name: 'rewriteResumeFlow',
    inputSchema: RewriteResumeInputSchema,
    outputSchema: RewriteResumeOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
