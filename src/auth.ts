import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Auto-allow anyone with this domain. Anything else must be listed in
// ALLOWED_EMAILS (comma-separated).
const ALLOWED_DOMAIN = "prohoods.com";

function isAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.toLowerCase().trim();
  if (e.endsWith(`@${ALLOWED_DOMAIN}`)) return true;
  const list = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(e);
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [Google],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    signIn({ profile }) {
      return isAllowed(profile?.email);
    },
    session({ session }) {
      return session;
    },
  },
});
