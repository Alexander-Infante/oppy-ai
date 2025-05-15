"use client";

import type { ParseResumeOutput } from '@/ai/flows/parse-resume';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Briefcase, GraduationCap, ListChecks, Info } from 'lucide-react'; // Changed Wand2 to ListChecks

interface ParsedResumeDisplayProps {
  parsedData: ParseResumeOutput;
}

export function ParsedResumeDisplay({ parsedData }: ParsedResumeDisplayProps) {
  const { skills, experience, education } = parsedData;

  const renderSection = (title: string, icon: React.ReactNode, items: any[], renderItem: (item: any, index: number) => React.ReactNode) => (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center text-xl">
          {icon}
          <span className="ml-2">{title}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items && items.length > 0 ? (
          <ul className="space-y-4">
            {items.map(renderItem)}
          </ul>
        ) : (
          <div className="flex items-center text-muted-foreground">
            <Info className="h-5 w-5 mr-2"/>
            <p>No {title.toLowerCase()} information extracted.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6 w-full">
      {renderSection("Skills", <ListChecks className="h-6 w-6 text-accent" />, skills, (skill, index) => (
        <li key={index} className="inline-block mr-2 mb-2">
          <Badge variant="secondary" className="text-sm py-1 px-3">{skill}</Badge>
        </li>
      ))}
      
      {renderSection("Work Experience", <Briefcase className="h-6 w-6 text-primary" />, experience, (exp, index) => (
        <li key={index} className="p-4 border rounded-lg bg-card">
          <h3 className="font-semibold text-lg">{exp.title}</h3>
          <p className="text-md text-primary">{exp.company}</p>
          <p className="text-sm text-muted-foreground">{exp.dates}</p>
          {exp.description && <p className="mt-1 text-sm">{exp.description}</p>}
          {index < experience.length - 1 && <Separator className="my-3" />}
        </li>
      ))}

      {renderSection("Education", <GraduationCap className="h-6 w-6 text-secondary" />, education, (edu, index) => (
         <li key={index} className="p-4 border rounded-lg bg-card">
          <h3 className="font-semibold text-lg">{edu.degree}</h3>
          <p className="text-md text-secondary">{edu.institution}</p>
          <p className="text-sm text-muted-foreground">{edu.dates}</p>
          {index < education.length - 1 && <Separator className="my-3" />}
        </li>
      ))}
    </div>
  );
}
