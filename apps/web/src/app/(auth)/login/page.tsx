"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Logo } from "@/components/Logo";
import { signIn, type AuthFormState } from "../actions";
import styles from "../auth.module.css";

const initialState: AuthFormState = { error: null };

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <form action={formAction}>
      <Logo />

      <h1 className={styles.title}>Bienvenido de nuevo</h1>
      <p className={styles.subtitle}>
        Entra para consultar y actualizar los mantenimientos.
      </p>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="email">
          Correo electrónico
        </label>
        <input
          className={styles.input}
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="password">
          Contraseña
        </label>
        <input
          className={styles.input}
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      {state.error ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}

      <button className={styles.submit} type="submit" disabled={pending}>
        {pending ? "Entrando…" : "Entrar en Cuotly"}
      </button>

      <p className={styles.footer}>
        ¿No tienes cuenta? <Link href="/signup">Regístrate</Link>
      </p>
    </form>
  );
}
