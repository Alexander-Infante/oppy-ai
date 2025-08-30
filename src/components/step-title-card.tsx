"use client";

import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { stepTitles, stepIcons } from "@/constants/steps";
import type { Step } from "@/types";

interface StepTitleCardProps {
  currentStep: Step;
  isLoading: boolean;
}

export function StepTitleCard({ currentStep, isLoading }: StepTitleCardProps) {
  const CurrentStepIcon = stepIcons[currentStep];

  return (
    <Card className="w-full max-w-md mb-6 shadow-md">
      <CardHeader>
        <CardTitle className="text-xl text-center flex items-center justify-center">
          <CurrentStepIcon
            className={`mr-2 h-6 w-6 ${
              (currentStep === "parse" || currentStep === "rewrite") && isLoading
                ? "animate-spin"
                : ""
            }`}
          />
          {stepTitles[currentStep]}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}