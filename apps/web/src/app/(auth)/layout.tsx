export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[radial-gradient(circle_at_50%_30%,var(--color-primary)_0%,var(--color-primary-dark)_45%,var(--color-primary-darkest)_100%)] p-6">
      <div className="w-full max-w-md rounded-[20px] bg-surface p-10 shadow-[0_30px_60px_-20px_rgba(5,21,16,0.5)]">
        {children}
      </div>
    </main>
  );
}
