import { NextRequest, NextResponse } from 'next/server';

// Define your discount codes here - keep in sync with create-payment-intent
const DISCOUNT_CODES = {
  'OPPYAI': {
    code: 'OPPYAI',
    percentage: 50,
    description: 'New Launch Special - 50% off',
    active: true,
    discountedAmount: 2500, // $25.00 in cents
  },
  // Add more discount codes as needed
} as const;

export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json();
    
    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { valid: false, error: 'Please enter a discount code' },
        { status: 400 }
      );
    }

    const normalizedCode = code.trim().toUpperCase();
    const discount = DISCOUNT_CODES[normalizedCode as keyof typeof DISCOUNT_CODES];

    if (!discount) {
      return NextResponse.json(
        { valid: false, error: 'Invalid discount code' },
        { status: 400 }
      );
    }

    if (!discount.active) {
      return NextResponse.json(
        { valid: false, error: 'This discount code has expired' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      valid: true,
      code: discount.code,
      percentage: discount.percentage,
      description: discount.description,
      discountedAmount: discount.discountedAmount,
    });

  } catch (error) {
    console.error('Error validating discount code:', error);
    return NextResponse.json(
      { valid: false, error: 'Failed to validate discount code' },
      { status: 500 }
    );
  }
}