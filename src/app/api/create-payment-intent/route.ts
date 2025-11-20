import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

// Define valid amounts (in cents)
const VALID_AMOUNTS = {
  FULL_PRICE: 5000,    // $50.00
  DISCOUNTED: 2500,    // $25.00 (50% off)
} as const;

// Define discount codes with their corresponding amounts
const DISCOUNT_CODES = {
  'OPPYAI': {
    percentage: 50,
    discountedAmount: VALID_AMOUNTS.DISCOUNTED,
  },
} as const;

export async function POST(request: NextRequest) {
  try {
    // ✅ Initialize Stripe inside the function
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    
    if (!stripeSecretKey) {
      console.error('STRIPE_SECRET_KEY environment variable is not set');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2025-08-27.basil',
    });

    const { amount, discountCode } = await request.json();

    // Validate that the amount is exactly one of our expected values
    let expectedAmount: number;
    let isValidAmount = false;

    if (discountCode) {
      // If a discount code is provided, validate it and check the amount
      const normalizedCode = discountCode.trim().toUpperCase();
      const discount = DISCOUNT_CODES[normalizedCode as keyof typeof DISCOUNT_CODES];
      
      if (!discount) {
        return NextResponse.json(
          { error: 'Invalid discount code' },
          { status: 400 }
        );
      }

      expectedAmount = discount.discountedAmount;
      isValidAmount = amount === expectedAmount;
    } else {
      // No discount code, should be full price
      expectedAmount = VALID_AMOUNTS.FULL_PRICE;
      isValidAmount = amount === expectedAmount;
    }

    if (!isValidAmount) {
      console.error(`Invalid payment amount received: ${amount}, expected: ${expectedAmount}`);
      return NextResponse.json(
        { error: 'Invalid payment amount' },
        { status: 400 }
      );
    }

    const paymentIntentData: Stripe.PaymentIntentCreateParams = {
      amount: expectedAmount, // Use the server-validated amount
      currency: 'usd',
      automatic_payment_methods: {
        enabled: true,
      },
    };

    // Add metadata for tracking
    if (discountCode) {
      paymentIntentData.metadata = {
        discount_code: discountCode,
        original_amount: VALID_AMOUNTS.FULL_PRICE.toString(),
        discount_percentage: DISCOUNT_CODES[discountCode.trim().toUpperCase() as keyof typeof DISCOUNT_CODES]?.percentage.toString() || '0',
      };
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentData);

    return NextResponse.json({ 
      clientSecret: paymentIntent.client_secret,
      amount: paymentIntent.amount,
    });
  } catch (error) {
    console.error('Payment intent creation failed:', error);
    return NextResponse.json(
      { error: 'Payment failed' },
      { status: 500 }
    );
  }
}