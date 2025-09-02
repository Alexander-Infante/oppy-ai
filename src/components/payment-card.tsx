"use client";

import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertCircle, Percent } from "lucide-react";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

interface PaymentFormProps {
  onPaymentSuccess: () => void;
  disabled?: boolean;
}

function PaymentForm({ onPaymentSuccess, disabled }: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Discount code state
  const [discountCode, setDiscountCode] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState<{
    code: string;
    percentage: number;
    amount: number;
  } | null>(null);
  const [discountError, setDiscountError] = useState<string | null>(null);
  const [isCheckingDiscount, setIsCheckingDiscount] = useState(false);

  // Pricing
  const originalAmount = 5000; // $50.00 in cents
  const [finalAmount, setFinalAmount] = useState(originalAmount);

  // Show the discount code prominently since it's a new app
  const [showDiscountHint, setShowDiscountHint] = useState(true);

  const validateDiscountCode = async (code: string) => {
    if (!code.trim()) {
      setDiscountError(null);
      setAppliedDiscount(null);
      setFinalAmount(originalAmount);
      return;
    }

    setIsCheckingDiscount(true);
    setDiscountError(null);

    try {
      const response = await fetch('/api/validate-discount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim().toUpperCase() })
      });

      const data = await response.json();

      if (response.ok && data.valid) {
        const discountAmount = Math.round((originalAmount * data.percentage) / 100);
        const newFinalAmount = originalAmount - discountAmount;
        
        setAppliedDiscount({
          code: data.code,
          percentage: data.percentage,
          amount: discountAmount
        });
        setFinalAmount(newFinalAmount);
        setDiscountError(null);
        setShowDiscountHint(false);
      } else {
        setAppliedDiscount(null);
        setFinalAmount(originalAmount);
        setDiscountError(data.error || 'Invalid discount code');
      }
    } catch (err) {
      setDiscountError('Failed to validate discount code');
      setAppliedDiscount(null);
      setFinalAmount(originalAmount);
    } finally {
      setIsCheckingDiscount(false);
    }
  };

  // Debounce discount code validation
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      validateDiscountCode(discountCode);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [discountCode]);

  const handlePayment = async (event: React.FormEvent) => {
    event.preventDefault();
    
    if (!stripe || !elements) {
      return;
    }

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      return;
    }

    setIsProcessing(true);
    setError(null);
    
    try {
      // Create payment intent on your backend
      const response = await fetch('/api/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          amount: finalAmount,
          discountCode: appliedDiscount?.code || null
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to create payment intent');
      }

      const { clientSecret } = await response.json();
      
      // Confirm payment with the card element
      const { error: confirmError } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardElement,
        }
      });
      
      if (confirmError) {
        setError(confirmError.message || 'Payment failed');
      } else {
        // Payment succeeded
        onPaymentSuccess();
      }
    } catch (err: any) {
      setError(err.message || 'Payment failed');
      console.error('Payment failed:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const formatPrice = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Complete Your Purchase</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handlePayment} className="space-y-6">
          {/* Pricing Summary */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm">Resume optimization and AI interview</span>
              <span className="text-sm">{formatPrice(originalAmount)}</span>
            </div>
            
            {appliedDiscount && (
              <div className="flex justify-between items-center text-green-600">
                <span className="text-sm flex items-center">
                  <CheckCircle className="w-4 h-4 mr-1" />
                  Discount ({appliedDiscount.code}) - {appliedDiscount.percentage}% off
                </span>
                <span className="text-sm">-{formatPrice(appliedDiscount.amount)}</span>
              </div>
            )}
            
            <div className="border-t pt-2">
              <div className="flex justify-between items-center font-semibold">
                <span>Total</span>
                <span className={appliedDiscount ? "text-green-600" : ""}>
                  {formatPrice(finalAmount)}
                  {appliedDiscount && (
                    <span className="ml-2 text-xs text-gray-500 line-through">
                      {formatPrice(originalAmount)}
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Discount Code Section */}
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="discount-code" className="text-sm font-medium">
                Discount Code
              </Label>
              <Input
                id="discount-code"
                type="text"
                placeholder="Enter discount code"
                value={discountCode}
                onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                disabled={isCheckingDiscount}
                className={appliedDiscount ? "border-green-500" : ""}
              />
            </div>
            
            {/* Discount hint for new app - Fixed: Changed p to div */}
            {showDiscountHint && !appliedDiscount && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-start space-x-2">
                  <Percent className="w-4 h-4 text-blue-600 mt-0.5" />
                  <div className="text-sm text-blue-800">
                    <div className="font-medium">New Launch Special!</div>
                    <div>Try code: <Badge variant="secondary" className="font-mono">OPPYAI</Badge> for 50% off</div>
                  </div>
                </div>
              </div>
            )}

            {/* Discount validation feedback */}
            {isCheckingDiscount && (
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-blue-600"></div>
                <span>Validating discount code...</span>
              </div>
            )}

            {appliedDiscount && (
              <div className="flex items-center space-x-2 text-sm text-green-600">
                <CheckCircle className="w-4 h-4" />
                <span>Discount applied successfully!</span>
              </div>
            )}

            {discountError && (
              <div className="flex items-center space-x-2 text-sm text-red-600">
                <AlertCircle className="w-4 h-4" />
                <span>{discountError}</span>
              </div>
            )}
          </div>

          {/* Payment Details */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Payment Details</Label>
            <div className="p-3 border rounded-md">
              <CardElement
                options={{
                  style: {
                    base: {
                      fontSize: '16px',
                      color: '#424770',
                      '::placeholder': {
                        color: '#aab7c4',
                      },
                    },
                  },
                }}
              />
            </div>
          </div>
          
          {error && (
            <div className="flex items-center space-x-2 text-red-600 text-sm">
              <AlertCircle className="w-4 h-4" />
              <span>{error}</span>
            </div>
          )}
          
          <Button 
            type="submit"
            disabled={disabled || isProcessing || !stripe}
            className="w-full"
            size="lg"
          >
            {isProcessing ? 'Processing...' : `Pay ${formatPrice(finalAmount)}`}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

interface PaymentCardProps {
  onPaymentSuccess: () => void;
  disabled?: boolean;
}

export function PaymentCard({ onPaymentSuccess, disabled }: PaymentCardProps) {
  const appearance = {
    theme: 'stripe' as const,
  };

  const options = {
    appearance,
  };

  return (
    <Elements stripe={stripePromise} options={options}>
      <PaymentForm onPaymentSuccess={onPaymentSuccess} disabled={disabled} />
    </Elements>
  );
}