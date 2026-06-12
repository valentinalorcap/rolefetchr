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
  pages: { signIn: "/signin" },
  callbacks: {
    // Reject anyone whose GitHub email isn't on the allowlist.
    signIn({ user }) {
      const email = user.email?.toLowerCase();
      return !!email && allowlist.includes(email);
    },
    // Drives the middleware: a request is authorized only with a session.
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
});
