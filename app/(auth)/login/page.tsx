"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, ArrowRight, Loader2 } from "lucide-react";

export default function SocietyStaffLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [societyId, setSocietyId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          accountType: "staff",
          societyId: societyId ? societyId.trim() : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Authentication failed");
      }

      router.push("/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4 py-12 text-zinc-100 antialiased selection:bg-zinc-800">
      <div className="w-full max-w-[400px]">
        {/* Brand Header */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md border border-zinc-800 bg-zinc-900/60 text-xs font-mono text-zinc-400 mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Society Portal
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white flex items-center gap-2">
            <Building2 className="w-6 h-6 text-emerald-400" />
            Society Staff Sign In
          </h1>
          <p className="mt-1 text-xs text-zinc-400">
            For Society Admins, Chairmen, Secretaries, Treasurers, and Accountants.
          </p>
        </div>

        {/* Form Card */}
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-md p-6 shadow-2xl space-y-4"
        >
          {error && (
            <div className="p-3 rounded-lg border border-red-500/20 bg-red-500/10 text-xs text-red-400 font-medium">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Staff Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="secretary@society.com"
              className="w-full px-3 py-2 text-sm bg-zinc-950/80 border border-zinc-800 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full px-3 py-2 text-sm bg-zinc-950/80 border border-zinc-800 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Society UUID (Optional)
            </label>
            <input
              type="text"
              value={societyId}
              onChange={(e) => setSocietyId(e.target.value)}
              placeholder="Leave blank for default assigned society"
              className="w-full px-3 py-2 text-xs bg-zinc-950/80 border border-zinc-800 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-500 font-mono"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-white hover:bg-zinc-200 text-zinc-950 font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Signing In...
              </>
            ) : (
              <>
                Enter Society Management
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Footer info */}
        <div className="mt-8 text-center text-xs text-zinc-500 space-y-2">
          <p>
            Resident flat login?{" "}
            <a href="/resident-login" className="text-zinc-400 hover:text-white underline underline-offset-4">
              Switch to Resident Portal
            </a>
          </p>
          <p className="font-mono text-[11px] text-zinc-600">
            Platform Operator?{" "}
            <a href="/platform-login" className="text-zinc-400 hover:text-white underline underline-offset-4 font-sans">
              Super Admin Portal
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
