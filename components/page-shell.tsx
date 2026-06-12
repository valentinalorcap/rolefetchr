import type { ReactNode } from "react";

const GRADIENT =
  "radial-gradient(120% 130% at 8% -10%, rgba(255,120,160,.40), transparent 55%)," +
  "radial-gradient(120% 120% at 55% -20%, rgba(255,176,120,.30), transparent 55%)," +
  "radial-gradient(130% 140% at 100% -10%, rgba(110,160,255,.38), transparent 55%)";
const FADE = "linear-gradient(180deg,#000 0%,#000 35%,transparent 100%)";

/** Page wrapper: a color wash at the top (scrolls with content) + a max-width column. */
export function PageShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[300px]"
        style={{ background: GRADIENT, WebkitMaskImage: FADE, maskImage: FADE }}
      />
      <div className="relative z-10 mx-auto max-w-[1180px] px-5 py-8 md:px-9">
        <header className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-[34px] font-extrabold leading-none tracking-tight">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-2 text-[15px] text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          {actions}
        </header>
        {children}
      </div>
    </div>
  );
}
