import type { ReactNode } from 'react';

/** Centered card for the sign-in screen. */
export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main id="main" className="mx-auto grid min-h-dvh w-full max-w-md content-center px-4 py-10">
      <div className="grid gap-5 rounded-card border border-line bg-panel p-6 shadow-float">
        <h1 className="text-[26px] leading-[1.15] font-extrabold tracking-tight text-balance">
          {title}
        </h1>
        {children}
      </div>
    </main>
  );
}
