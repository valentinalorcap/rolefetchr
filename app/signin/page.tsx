import { signIn } from "@/auth";

export const metadata = { title: "Sign in · job-matchmaker" };

const GRADIENT =
  "radial-gradient(120% 130% at 8% -10%, rgba(255,120,160,.34), transparent 55%)," +
  "radial-gradient(130% 140% at 100% -10%, rgba(110,160,255,.32), transparent 55%)";
const FADE = "linear-gradient(180deg,#000 0%,#000 35%,transparent 100%)";

export default function SignInPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[320px]"
        style={{ background: GRADIENT, WebkitMaskImage: FADE, maskImage: FADE }}
      />
      <div className="relative z-10 w-full max-w-sm rounded-2xl bg-card p-8 text-center">
        <div className="text-[25px] font-extrabold tracking-tight">
          job-matchmaker
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Private workspace. Sign in to continue.
        </p>
        <form
          action={async () => {
            "use server";
            await signIn("github", { redirectTo: "/" });
          }}
          className="mt-7"
        >
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <svg viewBox="0 0 16 16" className="size-4 fill-current" aria-hidden>
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            Continue with GitHub
          </button>
        </form>
      </div>
    </div>
  );
}
