"use client";

import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";

/** Submit button with visible press + pending feedback (for server-action forms). */
export function SubmitButton({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={cn(
        "transition active:scale-[.97] active:brightness-90 disabled:cursor-progress disabled:opacity-70",
        className,
      )}
    >
      {children}
    </button>
  );
}
