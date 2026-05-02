import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import * as schema from "./db/schema";

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
const secret = process.env.BETTER_AUTH_SECRET ?? (isBuildPhase ? "build-phase-placeholder-not-used-at-runtime" : undefined);
if (!secret || secret.length < 32) {
  throw new Error("BETTER_AUTH_SECRET must be set and at least 32 characters");
}

export const auth = betterAuth({
  appName: "SevaSetu",
  baseURL,
  secret,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
  },
  user: {
    additionalFields: {
      role: { type: "string", required: false, defaultValue: "customer" },
      phone: { type: "string", required: false },
      phoneVerified: { type: "boolean", required: false, defaultValue: false },
      locale: { type: "string", required: false, defaultValue: "en" },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },
  advanced: {
    cookiePrefix: "sevasetu",
    useSecureCookies: process.env.NODE_ENV === "production",
  },
  trustedOrigins: [
    baseURL,
    "https://sevasetu.dmj.one",
    "https://sevasetu-107722137045.asia-east1.run.app",
  ],
});

export type Auth = typeof auth;
