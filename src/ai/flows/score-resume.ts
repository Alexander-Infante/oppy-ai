// This is an AI-powered function that scores a resume based on modern resume scoring techniques.
// It provides a comprehensive analysis with actionable feedback.

'use server';

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const ScoreResumeInputSchema = z.object({
    resumeDataUri: z
        .string()
        .describe(
            "A resume file, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
        ),
});
export type ScoreResumeInput = z.infer<typeof ScoreResumeInputSchema>;

const ScoreResumeOutputSchema = z.object({
    overallScore: z.number().min(0).max(100).describe('Overall resume score out of 100'),
    categoryScores: z.object({
        formatting: z.number().min(0).max(100).describe('Score for formatting and visual appeal'),
        content: z.number().min(0).max(100).describe('Score for content quality and relevance'),
        keywords: z.number().min(0).max(100).describe('Score for ATS-friendly keywords'),
        experience: z.number().min(0).max(100).describe('Score for work experience presentation'),
        skills: z.number().min(0).max(100).describe('Score for skills section'),
        education: z.number().min(0).max(100).describe('Score for education section'),
        achievements: z.number().min(0).max(100).describe('Score for quantified achievements'),
    }).describe('Breakdown of scores by category'),
    strengths: z.array(z.string()).describe('List of resume strengths'),
    improvements: z.array(z.string()).describe('List of suggested improvements'),
    atsCompatibility: z.number().min(0).max(100).describe('ATS (Applicant Tracking System) compatibility score'),
    recommendations: z.array(z.string()).describe('Specific actionable recommendations'),
    industryAlignment: z.string().describe('Assessment of how well the resume aligns with industry standards'),
});
export type ScoreResumeOutput = z.infer<typeof ScoreResumeOutputSchema>;

export async function scoreResume(input: ScoreResumeInput): Promise<ScoreResumeOutput> {
    return scoreResumeFlow(input);
}

const scoreResumePrompt = ai.definePrompt({
    name: 'scoreResumePrompt',
    input: { schema: ScoreResumeInputSchema },
    output: { schema: ScoreResumeOutputSchema },
    prompt: `You are an expert resume analyst and career coach with extensive experience in modern hiring practices and ATS systems. Analyze the provided resume and score it comprehensively based on current industry standards.

SCORING CRITERIA:

1. FORMATTING (0-100):
   - Clean, professional layout
   - Consistent formatting and typography
   - Appropriate use of white space
   - Easy to scan and read
   - Professional font choices

2. CONTENT QUALITY (0-100):
   - Clear, concise writing
   - Action-oriented language
   - Relevant information only
   - Professional summary/objective
   - Contact information completeness

3. KEYWORDS & ATS COMPATIBILITY (0-100):
   - Industry-relevant keywords
   - Job-specific terminology
   - Skills mentioned in context
   - Avoiding graphics/tables that confuse ATS
   - Standard section headings

4. EXPERIENCE PRESENTATION (0-100):
   - Clear job progression
   - Relevant work history
   - Appropriate level of detail
   - Chronological consistency
   - Company and role clarity

5. SKILLS SECTION (0-100):
   - Relevant technical skills
   - Appropriate skill categorization
   - Balance of hard and soft skills
   - Skills backed by experience
   - Current technology knowledge

6. EDUCATION (0-100):
   - Relevant educational background
   - Proper formatting
   - Inclusion of relevant certifications
   - GPA inclusion when beneficial
   - Professional development

7. ACHIEVEMENTS & QUANTIFICATION (0-100):
   - Quantified results and impact
   - Specific accomplishments
   - Use of metrics and numbers
   - Awards and recognition
   - Problem-solving examples

ANALYSIS REQUIREMENTS:
- Provide specific, actionable feedback
- Consider modern hiring practices and ATS systems
- Focus on what recruiters and hiring managers look for
- Include industry-specific recommendations when possible
- Highlight both strengths and areas for improvement

Resume to analyze: {{media url=resumeDataUri}}

Provide a comprehensive analysis with scores, strengths, improvements, and actionable recommendations.`,
});

const scoreResumeFlow = ai.defineFlow(
    {
        name: 'scoreResumeFlow',
        inputSchema: ScoreResumeInputSchema,
        outputSchema: ScoreResumeOutputSchema,
    },
    async input => {
        const { output } = await scoreResumePrompt(input);
        return output!;
    }
);