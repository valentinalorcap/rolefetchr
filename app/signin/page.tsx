import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { enterDemo } from "@/lib/scope";
import { SubmitButton } from "@/components/submit-button";

export const metadata = { title: "Sign in · rolefetchr" };

const GRADIENT =
  "radial-gradient(120% 130% at 8% -10%, rgba(255,120,160,.34), transparent 55%)," +
  "radial-gradient(130% 140% at 100% -10%, rgba(110,160,255,.32), transparent 55%)";
const FADE = "linear-gradient(180deg,#000 0%,#000 35%,transparent 100%)";

// Return targets must be same-site relative paths (guards open redirects).
function safePath(value: unknown): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/";
}

async function enterDemoAction(formData: FormData) {
  "use server";
  const code = String(formData.get("code") ?? "").trim();
  const ok = code ? await enterDemo(code) : false;
  const back = safePath(formData.get("callbackUrl"));
  redirect(ok ? back : `/signin?error=code${back !== "/" ? `&callbackUrl=${encodeURIComponent(back)}` : ""}`);
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const { error, callbackUrl } = await searchParams;
  const redirectTo = safePath(callbackUrl);

  return (
    <div className="relative flex min-h-screen items-center justify-center px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[320px]"
        style={{ background: GRADIENT, WebkitMaskImage: FADE, maskImage: FADE }}
      />
      <div className="relative z-10 w-full max-w-sm rounded-2xl bg-card p-8 text-center">
        <div className="text-[25px] font-extrabold tracking-tight">
          rolefetchr
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Private workspace. Sign in to continue.
        </p>

        <form
          action={async () => {
            "use server";
            await signIn("github", { redirectTo });
          }}
          className="mt-7"
        >
          <SubmitButton className="flex w-full items-center justify-center gap-2.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
            <svg viewBox="0 0 16 16" className="size-4 fill-current" aria-hidden>
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            Continue with GitHub
          </SubmitButton>
        </form>

        {error === "AccessDenied" ? (
          <p className="mt-3 text-xs leading-relaxed" style={{ color: "#e3909e" }}>
            That GitHub account isn&apos;t allowed — this is a personal,
            single-tenant app. Have an access code? Enter it below to explore
            the demo.
          </p>
        ) : error && error !== "code" ? (
          <p className="mt-3 text-xs" style={{ color: "#e3909e" }}>
            Sign-in failed. Please try again.
          </p>
        ) : null}

        <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>

        <form action={enterDemoAction} className="text-left">
          <input type="hidden" name="callbackUrl" value={redirectTo} />
          <label
            htmlFor="code"
            className="text-xs font-medium text-muted-foreground"
          >
            Have an access code?
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              id="code"
              name="code"
              type="text"
              autoComplete="off"
              placeholder="Enter your code"
              className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
            />
            <SubmitButton className="h-10 shrink-0 rounded-lg border border-border bg-secondary px-4 text-sm font-semibold hover:bg-accent">
              Enter
            </SubmitButton>
          </div>
          {error === "code" ? (
            <p className="mt-2 text-xs" style={{ color: "#e3909e" }}>
              That code is not valid. Check it and try again.
            </p>
          ) : null}
        </form>
      </div>
    </div>
  );
}
