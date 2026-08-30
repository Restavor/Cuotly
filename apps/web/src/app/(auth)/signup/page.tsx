"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Logo } from "@/components/Logo";
import { Button, Field } from "@/components/ui";
import { es } from "@/i18n/es";
import { signUp, type AuthFormState } from "../actions";

const initialState: AuthFormState = { error: null };

export default function SignUpPage() {
  const [state, formAction, pending] = useActionState(signUp, initialState);
  const t = es.auth.signup;

  return (
    <form action={formAction}>
      <Logo />

      <h1 className="mb-1.5 text-2xl font-bold text-primary-dark">{t.title}</h1>
      <p className="mb-7 text-sm text-text-secondary">{t.subtitle}</p>

      <Field
        label={t.emailLabel}
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
      />

      <Field
        label={t.passwordLabel}
        id="password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
      />

      {state.error ? (
        <p role="alert" className="mb-4 rounded-lg bg-danger/10 px-3 py-2.5 text-sm text-danger">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" pending={pending} className="w-full">
        {pending ? t.submitPending : t.submit}
      </Button>

      <p className="mt-6 text-center text-sm text-text-secondary">
        {t.hasAccount}{" "}
        <Link href="/login" className="font-semibold text-primary">
          {t.loginLink}
        </Link>
      </p>
    </form>
  );
}
