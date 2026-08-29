import styles from "@/app/(auth)/auth.module.css";

export function Logo() {
  return (
    <div className={styles.logo}>
      <div className={styles.logoMark}>C</div>
      <div className={styles.logoName}>Cuotly</div>
    </div>
  );
}
