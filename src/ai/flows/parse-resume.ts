// This is an AI-powered function that parses a resume to extract key information.
// It identifies skills, experience, and education to streamline the voice interview process.

'use server';

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ParseResumeInputSchema = z.object({
  resumeDataUri: z
    .string()
    .describe(
      "A resume file, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type ParseResumeInput = z.infer<typeof ParseResumeInputSchema>;

const ParseResumeOutputSchema = z.object({
  skills: z.array(z.string()).describe('List of skills extracted from the resume.'),
  experience: z
    .array(
      z.object({
        title: z.string().describe('Job title'),
        company: z.string().describe('Company name'),
        dates: z.string().describe('Dates of employment'),
        description: z.string().describe('Job description'),
      })
    )
    .describe('List of work experiences.'),
  education: z
    .array(
      z.object({
        institution: z.string().describe('Name of the educational institution'),
        degree: z.string().describe('Degree obtained'),
        dates: z.string().describe('Dates of attendance'),
      })
    )
    .describe('List of educational experiences.'),
});
export type ParseResumeOutput = z.infer<typeof ParseResumeOutputSchema>;

export async function parseResume(input: ParseResumeInput): Promise<ParseResumeOutput> {
  return parseResumeFlow(input);
}

const parseResumePrompt = ai.definePrompt({
  name: 'parseResumePrompt',
  input: {schema: ParseResumeInputSchema},
  output: {schema: ParseResumeOutputSchema},
  prompt: `You are an expert resume parser. Extract the following information from the resume:

Skills: A list of skills mentioned in the resume.
Experience: A list of work experiences, including job title, company, dates of employment, and a brief description of the responsibilities.
Education: A list of educational experiences, including the name of the institution, degree obtained, and dates of attendance.

Resume: {{media url=resumeDataUri}}

Output the information in JSON format. Make sure to include all keys and data even if it is empty.`,
});

const parseResumeFlow = ai.defineFlow(
  {
    name: 'parseResumeFlow',
    inputSchema: ParseResumeInputSchema,
    outputSchema: ParseResumeOutputSchema,
  },
  async input => {
    const {output} = await parseResumePrompt(input);
    return output!;
  }
);
