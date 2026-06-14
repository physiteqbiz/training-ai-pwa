import "server-only";

import Stripe from "stripe";

import { requireEnv } from "@/lib/env";

let stripeClient: Stripe | null = null;

export function getStripe() {
  if (!stripeClient) {
    stripeClient = new Stripe(requireEnv("STRIPE_SECRET_KEY"));
  }

  return stripeClient;
}

export const stripe = new Proxy({} as Stripe, {
  get(_target, property, receiver) {
    return Reflect.get(getStripe(), property, receiver);
  }
});

export function summarizeStripeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown Stripe error.";
}
