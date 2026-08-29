"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Logo } from "@/components/Logo";
import { signUp, type AuthFormState } from "../actions";
import styles from "../auth.module.css";

const initialState: AuthFormState = { error: null };

export default function SignUpPage() {
  const [state, formAction, pending] = useActionState(signUp, initialState);

  return (
    <form action={formAction}>
      <Logo />

      <h1 className={styles.title}>Crea tu cuenta</h1>
      <p className={styles.subtitle}>
        Regístrate para empezar a gestionar tu mantenimiento en Cuotly.
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
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>

      {state.error ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}

      <button className={styles.submit} type="submit" disabled={pending}>
        {pending ? "Creando cuenta…" : "Crear cuenta"}
      </button>

      <p className={styles.footer}>
        ¿Ya tienes cuenta? <Link href="/login">Entra</Link>
      </p>
    </form>
  );
}
