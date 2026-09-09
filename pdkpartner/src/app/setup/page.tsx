import { SetupWizard } from "@/components/SetupWizard";

export default function SetupPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-gray-900">PDK Partner Portal</h1>
          <p className="text-sm text-gray-500 mt-1">Connect your accounts to get started</p>
        </div>
        <SetupWizard />
      </div>
    </div>
  );
}
