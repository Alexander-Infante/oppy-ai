'use server';

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ExtractResumeTextInputSchema = z.object({
  resumeDataUri: z
    .string()
    .describe(
      "A resume file, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type ExtractResumeTextInput = z.infer<typeof ExtractResumeTextInputSchema>;

const ExtractResumeTextOutputSchema = z.object({
  textContent: z.string().describe('The full text content extracted from the resume file.'),
});
export type ExtractResumeTextOutput = z.infer<typeof ExtractResumeTextOutputSchema>;

export async function extractResumeText(input: ExtractResumeTextInput): Promise<ExtractResumeTextOutput> {
  return extractResumeTextFlow(input);
}

const extractTextPrompt = ai.definePrompt({
  name: 'extractResumeTextPrompt',
  input: {schema: ExtractResumeTextInputSchema},
  output: {schema: ExtractResumeTextOutputSchema},
  prompt: `Extract all the text content from this resume file. Return the complete text as it appears in the document, preserving the original formatting and structure as much as possible.

Resume: {{media url=resumeDataUri}}

Return only the extracted text content without any additional commentary or formatting changes.`,
});

const extractResumeTextFlow = ai.defineFlow(
  {
    name: 'extractResumeTextFlow',
    inputSchema: ExtractResumeTextInputSchema,
    outputSchema: ExtractResumeTextOutputSchema,
  },
  async input => {
    const {output} = await extractTextPrompt(input);
    return output!;
  }
);