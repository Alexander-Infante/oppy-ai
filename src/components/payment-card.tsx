"use client";

import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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
        body: JSON.stringify({ amount: 5000 }) // $50.00 in cents
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

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Complete Your Purchase</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handlePayment} className="space-y-4">
          <div className="mb-4">
            <p className="text-sm text-muted-foreground mb-2">
              Resume optimization and AI interview - $50
            </p>
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
            <div className="text-red-600 text-sm">
              {error}
            </div>
          )}
          
          <Button 
            type="submit"
            disabled={disabled || isProcessing || !stripe}
            className="w-full"
          >
            {isProcessing ? 'Processing...' : 'Pay $50'}
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