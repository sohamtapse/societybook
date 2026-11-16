"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, ArrowRight, Loader2 } from "lucide-react";

export default function PlatformLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("superadmin@societybook.internal");
  const [password, setPassword] = useState("SuperAdmin@Secure2026!");
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
          accountType: "platform",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Authentication failed");
      }

      router.push("/platform");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in as operator");
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
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            SocietyBook Master SaaS
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-emerald-400" />
            Platform Super Admin
          </h1>
          <p className="mt-1 text-xs text-zinc-400">
            Dedicated sign-in path for SaaS operator &amp; platform governance.
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
              Operator Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="superadmin@societybook.internal"
              className="w-full px-3 py-2 text-sm bg-zinc-950/80 border border-zinc-800 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Operator Password
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

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-white hover:bg-zinc-200 text-zinc-950 font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Verifying Operator Access...
              </>
            ) : (
              <>
                Enter Platform Console
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Footer info */}
        <div className="mt-8 text-center text-xs text-zinc-500 space-y-1 font-mono">
          <p>Restricted access • Monitored platform operator endpoint</p>
          <p className="font-sans">
            Society staff member?{" "}
            <a href="/login" className="text-zinc-400 hover:text-white underline underline-offset-4">
              Go to Society Staff Login
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

