"use client";
import { createAuthClient } from "better-auth/react";

// No baseURL — Better-Auth's client uses paths relative to the current origin,
// so the same bundle works on localhost and on the deployed Cloud Run URL
// without needing build-time NEXT_PUBLIC_APP_URL injection.
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession, getSession } = authClient;
