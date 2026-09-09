import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      // Restrict to @fivetran.com emails only
      return profile?.email?.endsWith("@fivetran.com") ?? false;
    },
    async session({ session, token }) {
      return session;
    },
  },
  pages: {
    signIn: "/signin",
    error: "/signin",
  },
};
