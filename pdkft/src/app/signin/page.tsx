import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { SignInButton } from "@/components/SignInButton";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const session = await getServerSession(authOptions);
  if (session) redirect("/demos");

  const isAccessDenied = searchParams.error === "AccessDenied";

  return (
    <div className="min-h-screen bg-sidebar-bg flex items-center justify-center">
      <div className="bg-white rounded-lg border border-gray-200 shadow-lg p-8 w-80 text-center">
        {/* Logo */}
        <div className="mb-6">
          <span className="text-sidebar-bg font-bold text-2xl tracking-tight">PDK</span>
          <span className="ml-1.5 text-xs text-gray-400 uppercase tracking-widest">internal</span>
        </div>

        <h1 className="text-base font-semibold text-gray-900 mb-1">Sign in</h1>
        <p className="text-sm text-gray-500 mb-6">Fivetran email required</p>

        {isAccessDenied && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700">
            Access denied. Only <strong>@fivetran.com</strong> accounts can sign in.
          </div>
        )}

        <SignInButton />
      </div>
    </div>
  );
}
