import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

// Single-tenant gate: only these emails may sign in. Comma-separated in env.
// Everyone else is rejected at the sign-in callback, even with a valid GitHub
// account. Multi-tenant (per-user CV/scores) is intentionally out of scope.
const allowlist = (process.env.ALLOWED_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  // We only ever run behind our own Vercel domain; trust the deployment host so
  // the session check works under `next start` too (Vercel auto-trusts, but
  // being explicit avoids UntrustedHost surprises).
  trustHost: true,
  // Errors (e.g. AccessDenied from the allowlist) land on our themed sign-in
  // page instead of Auth.js's unstyled defaults.
  pages: { signIn: "/signin", error: "/signin" },
  callbacks: {
    // Reject anyone whose GitHub email isn't on the allowlist. GitHub hides
    // profile.email when email privacy is on, so fall back to the primary
    // verified address from /user/emails (the provider requests user:email).
    async signIn({ user, account }) {
      let email = user.email?.toLowerCase();
      if (!email && account?.access_token) {
        const res = await fetch("https://api.github.com/user/emails", {
          headers: {
            Authorization: `Bearer ${account.access_token}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "rolefetchr",
          },
        });
        if (res.ok) {
          const emails: Array<{
            email: string;
            primary: boolean;
            verified: boolean;
          }> = await res.json();
          const pick =
            emails.find((e) => e.primary && e.verified) ??
            emails.find((e) => e.verified);
          email = pick?.email.toLowerCase();
        }
      }
      return !!email && allowlist.includes(email);
    },
  },
});
