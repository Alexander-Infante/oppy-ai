
'use server';
/**
 * @fileOverview A Genkit flow to conduct a conversational interview based on a parsed resume.
 *
 * - conductInterview - A function that handles the interview conversation turn.
 * - ConductInterviewInput - The input type for the conductInterview function.
 * - ConductInterviewOutput - The return type for the conductInterview function.
 */

import {ai} from '@/ai/genkit';
import {z}  from 'genkit';
// import type { ParseResumeOutput } from './parse-resume'; // Not directly used here, but ParsedResumeDataSchema defines its structure

// Define Zod schema for the conversation history entry (Genkit message format)
const GenkitChatMessageSchema = z.object({
  role: z.enum(['user', 'model']),
  isUser: z.boolean().optional(), // Flag to indicate if the role is 'user'
  isModel: z.boolean().optional(), // Flag to indicate if the role is 'model'
  parts: z.array(z.object({text: z.string()})),
});
export type ChatMessage = z.infer<typeof GenkitChatMessageSchema>; // Exporting the type, not the schema object

// Define Zod schemas for the resume data structure, mirroring ParseResumeOutput
const SkillsSchema = z.array(z.string()).describe('List of skills from the resume.');
const ExperienceSchema = z.array(
  z.object({
    title: z.string().describe('Job title'),
    company: z.string().describe('Company name'),
    dates: z.string().describe('Dates of employment'),
    description: z.string().describe('Job description'),
  })
).describe('List of work experiences from the resume.');
const EducationSchema = z.array(
  z.object({
    institution: z.string().describe('Name of the educational institution'),
    degree: z.string().describe('Degree obtained'),
    dates: z.string().describe('Dates of attendance'),
  })
).describe('List of educational experiences from the resume.');

const ParsedResumeDataSchema = z.object({
  skills: SkillsSchema,
  experience: ExperienceSchema,
  education: EducationSchema,
});
// This type will be used in ConductInterviewInput
export type ParsedResumeData = z.infer<typeof ParsedResumeDataSchema>;


const ConductInterviewInputSchema = z.object({
  parsedResume: ParsedResumeDataSchema.describe("The parsed data from the user's resume."),
  chatHistory: z.array(GenkitChatMessageSchema).describe('The history of the conversation so far.'),
  userMessage: z.string().optional().describe('The latest message from the user. Optional for the first turn.'),
});
export type ConductInterviewInput = z.infer<typeof ConductInterviewInputSchema>;

const ConductInterviewOutputSchema = z.object({
  aiMessage: z.string().describe("The AI's response or question."),
});
export type ConductInterviewOutput = z.infer<typeof ConductInterviewOutputSchema>;

export async function conductInterview(input: ConductInterviewInput): Promise<ConductInterviewOutput> {
  return conductInterviewFlow(input);
}

const interviewPrompt = ai.definePrompt({
  name: 'conductInterviewPrompt',
  input: { schema: ConductInterviewInputSchema },
  output: { schema: ConductInterviewOutputSchema },
  prompt: `You are a friendly and professional interviewer. Your goal is to have a brief conversation with the candidate to clarify points on their resume or gather additional information that will be useful for rewriting their resume.

Parsed Resume Information:
Skills:
{{#each parsedResume.skills}}
- {{this}}
{{/each}}

Work Experience:
{{#each parsedResume.experience}}
- Title: {{this.title}}
  Company: {{this.company}}
  Dates: {{this.dates}}
  Description: {{this.description}}
{{/each}}

Education:
{{#each parsedResume.education}}
- Degree: {{this.degree}}
  Institution: {{this.institution}}
  Dates: {{this.dates}}
{{/each}}

Conversation History:
{{#each chatHistory}}
{{#if this.isUser}}User: {{this.parts.0.text}}{{/if}}
{{#if this.isModel}}AI: {{this.parts.0.text}}{{/if}}
{{/each}}

{{#if userMessage}}
User: {{userMessage}}
{{/if}}

Based on the resume and the conversation history, provide a concise and relevant response or ask a clarifying question.
If the chat history is empty and there's no user message, start with an opening question related to the resume.
Ask only one question at a time. Ensure your output is only the AI's direct response, without any preamble like "AI:" or "AI Response:".
`,
});


const conductInterviewFlow = ai.defineFlow(
  {
    name: 'conductInterviewFlow',
    inputSchema: ConductInterviewInputSchema,
    outputSchema: ConductInterviewOutputSchema,
  },
  async (input) => {
    // Ensure Handlebars can iterate over empty arrays without issues
    const populatedInput = {
      ...input,
      parsedResume: {
        skills: input.parsedResume.skills || [],
        experience: input.parsedResume.experience || [],
        education: input.parsedResume.education || [],
      },
      chatHistory: input.chatHistory || [],
    };

    const { output } = await interviewPrompt(populatedInput);
    if (!output) {
      throw new Error("The AI model did not return a message.");
    }
    return { aiMessage: output.aiMessage };
  }
);

