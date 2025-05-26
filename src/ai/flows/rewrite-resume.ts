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

Your task is to rewrite the provided "Original Resume" by **actively incorporating insights and new information** from the "Interview Data".
The goal is to significantly enhance the resume to increase its chances of passing through screening software.

Original Resume:
{{media url=resumeDataUri}}

Interview Data:
{{interviewData}}

**Instructions for rewriting:**
1.  **Integrate Interview Insights:** Carefully review the "Interview Data". Use the information discussed to expand on experiences, clarify skills, add achievements, or rephrase sections of the "Original Resume". The interview data is key to improving the resume.
2.  **ATS Optimization:** Ensure the rewritten resume is formatted for optimal parsing by Applicant Tracking Systems. This includes using relevant keywords naturally.
3.  **Preserve Core Information (but enhance it):** While you must include all crucial information from the original resume (like job titles, companies, dates, education), you should rephrase, expand, or improve descriptions based on the interview data. Do not simply copy old sections if the interview provides a better way to present them. If the interview data provides specific examples or quantifiable achievements not present in the original resume, make sure to incorporate them.
4.  **Output:** Provide only the full text of the rewritten resume. Do not include any other commentary.
`,
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
