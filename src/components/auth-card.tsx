"use client";

import { Chrome, Shield, Lock, Star, Rocket } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface AuthCardProps {
  onSignIn: () => void;
  isLoading: boolean;
  authLoading: boolean;
}

export function AuthCard({ onSignIn, isLoading, authLoading }: AuthCardProps) {
  return (
    <Card className="w-full max-w-md shadow-xl border-2 border-blue-200">
      <CardHeader className="text-center pb-4">
        <div className="flex items-center justify-center mb-4">
          <div className="relative">
            <Shield className="h-10 w-10 text-blue-600" />
            <Lock className="h-4 w-4 text-blue-800 absolute -top-1 -right-1" />
          </div>
        </div>
        <CardTitle className="text-2xl text-blue-900">
          Your Free Resume
        </CardTitle>
        <CardTitle className="text-2xl text-blue-900">
          Strength Report Is Ready!
        </CardTitle>
        <CardDescription className="text-base text-gray-700">
          Sign in now to see your score and personalized improvement plan.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="p-3 bg-green-50 rounded-lg border border-green-200">
          <p className="text-sm text-green-800 text-center">
            ✅ Resume uploaded successfully! Sign in to continue.
          </p>
        </div>

        <Button
          onClick={onSignIn}
          disabled={isLoading || authLoading}
          size="lg"
          className="w-full bg-blue-600 text-white border-2 border-blue-600 hover:bg-blue-700 hover:border-blue-700 shadow-lg transition-all duration-200 text-lg font-semibold py-3"
        >
          <Chrome className="mr-3 h-5 w-5" />
          See My FREE Report
        </Button>

        <p className="text-center text-sm text-gray-600">
          Sign in with Google to view your AI analysis now.
        </p>

        <div className="grid grid-cols-2 gap-4 mt-6">
          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
            <div className="text-center">
              <Star className="h-6 w-6 text-green-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-green-800">
                Premium AI Analysis
              </p>
              <p className="text-xs text-green-700 mt-1">
                Deep interview insights
              </p>
            </div>
          </div>
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="text-center">
              <Rocket className="h-6 w-6 text-blue-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-blue-800">
                Professional Rewrite
              </p>
              <p className="text-xs text-blue-700 mt-1">
                ATS-optimized format
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 p-4 bg-gradient-to-r from-green-50 to-blue-50 rounded-lg border border-green-200">
          <div className="text-sm text-gray-800 space-y-2">
            <p className="font-medium text-center text-green-900 mb-3">
              🎯 Get your AI-powered resume score and tailored advice —
              then instantly upgrade to a professional rewrite proven to
              boost recruiter responses.
            </p>
            <div className="space-y-2 text-xs">
              <div className="flex items-start space-x-2">
                <span className="text-green-600 font-bold">✓</span>
                <span>
                  Know exactly how your resume ranks against other
                  applicants
                </span>
              </div>
              <div className="flex items-start space-x-2">
                <span className="text-green-600 font-bold">✓</span>
                <span>
                  Get a custom action plan to fix gaps instantly
                </span>
              </div>
              <div className="flex items-start space-x-2">
                <span className="text-green-600 font-bold">✓</span>
                <span>
                  Upgrade for a pro rewrite that passes ATS and wins
                  interviews
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-xs text-blue-800 text-center font-medium">
            🏆 Trusted by 20,000+ job seekers to improve interview
            call-backs
          </p>
        </div>

        <div className="text-center mt-6">
          <p className="text-xs text-muted-foreground">
            🔒 Secure sign-up • No spam • Cancel anytime
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            By continuing, you agree to our Terms of Service and Privacy
            Policy.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}