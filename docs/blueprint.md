# **App Name**: OppyAI

## Core Features:

- Resume Upload: Users upload their resume in common formats (e.g., PDF, DOCX).
- Resume Parsing: An LLM parses the uploaded resume to extract key information such as skills, experience, and education.
- Voice Interview Integration: Integrate with A11Labs API for a voice-based interview simulation, using the parsed resume data as context.  This service will be used as a tool by another LLM.
- Resume Rewriting: LLM evaluates voice conversation data from A11Labs to re-write sections of the original resume and increase the chances that it passes through screening software.
- Revision Output: Display the rewritten resume in an editable format for the user to review, accept, or modify and allow the result to be downloaded as JSON or Text.

## Style Guidelines:

- Primary color: #3366FF (Blue) for buttons and progress elements.
- Secondary color: #6633FF (Purple) for highlights and secondary actions.
- Neutral Dark: #333333 for primary text.
- Neutral Mid: #7A7A7A for secondary text.
- Neutral Light: #F5F7FA for backgrounds.
- Success: #27AE60 for completions and confirmations.
- Alert: #EB5757 for warnings and errors.
- Accent: Teal (#008080) for interactive elements and key calls to action.
- Clean and professional typography to ensure readability.
- Use a consistent set of icons to represent different resume sections (e.g., experience, education, skills).
- A clear, structured layout that is easy to navigate.
- Subtle animations to indicate progress during resume parsing and rewriting.