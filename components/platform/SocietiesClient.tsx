"use client";

import { useState } from "react";
import { Building2, Plus, ShieldCheck, X, Loader2, Edit3, CheckCircle2, AlertCircle } from "lucide-react";

interface SocietyRow {
  id: string;
  code: string;
  name: string;
  registrationNumber: string | null;
  city: string | null;
  state: string | null;
  status: string;
  createdAt: string;
  maxFlats: number | null;
  maxUsers: number | null;
  subStartsAt?: string | null;
  subExpiresAt?: string | null;
  subStatus?: string | null;
}

interface PlanOption {
  id: string;
  code: string;
  name: string;
  priceInr: string;
  maxFlatsDefault: number;
  maxUsersDefault: number;
}

export function SocietiesClient({
  initialSocieties,
  availablePlans,
}: {
  initialSocieties: SocietyRow[];
  availablePlans: PlanOption[];
}) {
  const [societies, setSocieties] = useState<SocietyRow[]>(initialSocieties);
  const [modalOpen, setModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingSociety, setEditingSociety] = useState<SocietyRow | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create Form inputs
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [city, setCity] = useState("Mumbai");
  const [state, setState] = useState("Maharashtra");
  const [contactEmail, setContactEmail] = useState("");
  const [planId, setPlanId] = useState(availablePlans[0]?.id || "");
  const [customMaxFlats, setCustomMaxFlats] = useState("");

  // Edit Form inputs
  const [editName, setEditName] = useState("");
  const [editStatus, setEditStatus] = useState<"active" | "suspended" | "archived">("active");
  const [editMaxFlats, setEditMaxFlats] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editState, setEditState] = useState("");
  const [editExpiresAt, setEditExpiresAt] = useState("");

  function openEditModal(soc: SocietyRow) {
    setEditingSociety(soc);
    setEditName(soc.name);
    setEditStatus((soc.status as "active" | "suspended" | "archived") || "active");
    setEditMaxFlats(soc.maxFlats ? String(soc.maxFlats) : "50");
    setEditCity(soc.city || "");
    setEditState(soc.state || "");
    setEditExpiresAt(
      soc.subExpiresAt
        ? new Date(soc.subExpiresAt).toISOString().split("T")[0]
        : ""
    );
    setError(null);
    setEditModalOpen(true);
  }

  async function handleCreateSociety(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/platform/societies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          name: name.trim(),
          registrationNumber: registrationNumber.trim() || undefined,
          city: city.trim() || undefined,
          state: state.trim() || undefined,
          contactEmail: contactEmail.trim() || undefined,
          planId,
          customMaxFlats: customMaxFlats ? parseInt(customMaxFlats, 10) : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create society");
      }

      setSocieties((prev) => [
        {
          id: data.society.id,
          code: data.society.code,
          name: data.society.name,
          registrationNumber: data.society.registrationNumber,
          city: data.society.city,
          state: data.society.state,
          status: data.society.status,
          createdAt: data.society.createdAt,
          maxFlats: customMaxFlats
            ? parseInt(customMaxFlats, 10)
            : availablePlans.find((p) => p.id === planId)?.maxFlatsDefault ?? 50,
          maxUsers: availablePlans.find((p) => p.id === planId)?.maxUsersDefault ?? 5,
        },
        ...prev,
      ]);

      setCode("");
      setName("");
      setRegistrationNumber("");
      setCustomMaxFlats("");
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creating society");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateSociety(e: React.FormEvent) {
    e.preventDefault();
    if (!editingSociety) return;

    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/platform/societies/${editingSociety.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          status: editStatus,
          maxFlats: editMaxFlats ? parseInt(editMaxFlats, 10) : undefined,
          city: editCity.trim() || undefined,
          state: editState.trim() || undefined,
          subscriptionExpiresAt: editExpiresAt ? new Date(editExpiresAt).toISOString() : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update society");
      }

      setSocieties((prev) =>
        prev.map((soc) =>
          soc.id === editingSociety.id
            ? {
                ...soc,
                name: data.society.name,
                status: data.society.status,
                maxFlats: data.society.maxFlats ?? soc.maxFlats,
                city: data.society.city,
                state: data.society.state,
                subExpiresAt: editExpiresAt ? new Date(editExpiresAt).toISOString() : soc.subExpiresAt,
              }
            : soc
        )
      );

      setEditModalOpen(false);
      setEditingSociety(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error updating society");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-zinc-950 dark:text-white">
            Societies &amp; Quotas
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            Create and edit tenant societies, update flat limits, or toggle active/suspended status.
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-zinc-950 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 font-medium text-xs transition-colors shadow-2xs w-full sm:w-auto shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Onboard New Society
        </button>
      </div>

      {/* Mobile Society Cards (visible only on mobile) */}
      <div className="space-y-3 md:hidden">
        {societies.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-400 dark:text-zinc-500 font-mono rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/30">
            No tenant societies onboarded yet.
          </div>
        ) : (
          societies.map((soc) => {
            const isExpired = soc.subExpiresAt ? new Date(soc.subExpiresAt) <= new Date() : false;
            return (
              <div
                key={soc.id}
                className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/40 shadow-2xs space-y-3"
              >
                {/* Header: Name, Code, and Status */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-sm text-zinc-950 dark:text-white truncate">
                      {soc.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-1 font-mono text-[11px] text-zinc-500">
                      <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 font-medium text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700/60">
                        {soc.code}
                      </span>
                      <span>•</span>
                      <span>{soc.maxFlats ?? "—"} flats</span>
                    </div>
                  </div>
                  <div>
                    {soc.status === "active" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        active
                      </span>
                    ) : soc.status === "suspended" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/20 shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        suspended
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 shrink-0">
                        {soc.status}
                      </span>
                    )}
                  </div>
                </div>

                {/* Details */}
                <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/60 grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-zinc-400 dark:text-zinc-500 block text-[10px] uppercase font-mono">Location</span>
                    <span className="text-zinc-700 dark:text-zinc-300 truncate block">
                      {[soc.city, soc.state].filter(Boolean).join(", ") || "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-400 dark:text-zinc-500 block text-[10px] uppercase font-mono">Subscription</span>
                    {soc.subExpiresAt ? (
                      <span className={`block truncate ${isExpired ? "text-red-500 font-medium" : "text-zinc-700 dark:text-zinc-300"}`}>
                        {isExpired ? "Expired" : new Date(soc.subExpiresAt).toLocaleDateString("en-IN")}
                      </span>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </div>
                </div>

                {/* Card Action */}
                <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/60">
                  <button
                    onClick={() => openEditModal(soc)}
                    className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs font-medium transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-zinc-500" />
                    Edit Society &amp; Quotas
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop Societies Table (hidden on mobile, visible on md+) */}
      <div className="hidden md:block rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/30 overflow-hidden shadow-2xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 text-zinc-500 dark:text-zinc-400 font-mono">
              <th className="py-3 px-4 font-medium">Tenant Code</th>
              <th className="py-3 px-4 font-medium">Society Name</th>
              <th className="py-3 px-4 font-medium">Location</th>
              <th className="py-3 px-4 font-medium">Flat Quota</th>
              <th className="py-3 px-4 font-medium">Subscription Period</th>
              <th className="py-3 px-4 font-medium">Status</th>
              <th className="py-3 px-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 text-zinc-700 dark:text-zinc-300">
            {societies.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-zinc-400 dark:text-zinc-500 font-mono">
                  No tenant societies onboarded yet. Click &ldquo;Onboard New Society&rdquo; to begin.
                </td>
              </tr>
            ) : (
              societies.map((soc) => {
                const isExpired = soc.subExpiresAt ? new Date(soc.subExpiresAt) <= new Date() : false;
                return (
                  <tr key={soc.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                    <td className="py-3 px-4 font-mono font-medium text-zinc-900 dark:text-white">
                      {soc.code}
                    </td>
                    <td className="py-3 px-4 font-medium text-zinc-800 dark:text-zinc-200">
                      {soc.name}
                    </td>
                    <td className="py-3 px-4 text-zinc-600 dark:text-zinc-400">
                      {[soc.city, soc.state].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="py-3 px-4 font-mono text-zinc-800 dark:text-zinc-300 font-medium">
                      {soc.maxFlats ?? "—"} flats
                    </td>
                    <td className="py-3 px-4 text-[11px] font-mono">
                      {soc.subStartsAt && soc.subExpiresAt ? (
                        <div>
                          <div className="text-zinc-600 dark:text-zinc-400">
                            {new Date(soc.subStartsAt).toLocaleDateString("en-IN")} →{" "}
                            <span className={isExpired ? "text-red-500 font-semibold" : "text-zinc-900 dark:text-zinc-200"}>
                              {new Date(soc.subExpiresAt).toLocaleDateString("en-IN")}
                            </span>
                          </div>
                          {isExpired && (
                            <div className="text-[10px] text-red-500 font-sans font-medium">
                              Subscription ended
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {soc.status === "active" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                          <span className="w-1 h-1 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                          active
                        </span>
                      ) : soc.status === "suspended" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20">
                          <AlertCircle className="w-2.5 h-2.5" />
                          suspended
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                          archived
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => openEditModal(soc)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors text-[11px] font-medium"
                      >
                        <Edit3 className="w-3 h-3 text-zinc-500" />
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Society Modal */}
      {editModalOpen && editingSociety && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 sm:p-6 shadow-2xl text-zinc-900 dark:text-zinc-100">
            <div className="flex items-center justify-between pb-3 sm:pb-4 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
                <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">
                  Edit Society: <span className="font-mono text-xs">{editingSociety.code}</span>
                </h2>
              </div>
              <button
                onClick={() => setEditModalOpen(false)}
                className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateSociety} className="mt-4 space-y-4 text-xs">
              {error && (
                <div className="p-2.5 rounded-md border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 font-medium">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-zinc-700 dark:text-zinc-400 mb-1 font-medium">
                  Society Name
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md text-zinc-900 dark:text-white focus:ring-1 focus:ring-zinc-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-700 dark:text-zinc-400 mb-1 font-medium">
                    Status
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as "active" | "suspended" | "archived")}
                    className="w-full px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md text-zinc-900 dark:text-white focus:ring-1 focus:ring-zinc-500 focus:outline-none"
                  >
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-700 dark:text-zinc-400 mb-1 font-medium">
                    Flat Limit Quota
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={editMaxFlats}
                    onChange={(e) => setEditMaxFlats(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md text-zinc-900 dark:text-white font-mono focus:ring-1 focus:ring-zinc-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-zinc-500 mt-0.5">Enforced in backend transactions</p>
                </div>
              </div>

              <div>
                <label className="block text-zinc-700 dark:text-zinc-400 mb-1 font-medium">
                  Subscription Expiry Date
                </label>
                <input
                  type="date"
                  value={editExpiresAt}
                  onChange={(e) => setEditExpiresAt(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md text-zinc-900 dark:text-white font-mono focus:ring-1 focus:ring-zinc-500 focus:outline-none"
                />
                <p className="text-[10px] text-zinc-500 mt-0.5">
                  Societies automatically suspend once this date has passed.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-700 dark:text-zinc-400 mb-1 font-medium">
                    City
                  </label>
                  <input
                    type="text"
                    value={editCity}
                    onChange={(e) => setEditCity(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md text-zinc-900 dark:text-white focus:ring-1 focus:ring-zinc-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-zinc-700 dark:text-zinc-400 mb-1 font-medium">
                    State
                  </label>
                  <input
                    type="text"
                    value={editState}
                    onChange={(e) => setEditState(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md text-zinc-900 dark:text-white focus:ring-1 focus:ring-zinc-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800/80">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="w-full sm:w-auto px-3.5 py-2 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-md bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Onboard Society Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 sm:p-6 shadow-2xl text-zinc-900 dark:text-zinc-100">
            <div className="flex items-center justify-between pb-3 sm:pb-4 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">Onboard New Society</h2>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSociety} className="mt-4 space-y-4 text-xs">
              {error && (
                <div className="p-2.5 rounded-md border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 font-medium">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-700 dark:text-zinc-400 mb-1 font-medium">
                    Tenant Code (e.g. GREENVALLEY)
                  </label>
                  <input
                    type="text"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="GREENVALLEY"
                    className="w-full px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md text-zinc-900 dark:text-white font-mono uppercase focus:ring-1 focus:ring-zinc-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-zinc-500 mt-0.5">Used for flat usernames</p>
                </div>

                <div>
                  <label className="block text-zinc-700 dark:text-zinc-400 mb-1 font-medium">
                    Society Name
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Green Valley CHS Ltd"
                    className="w-full px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md text-zinc-900 dark:text-white focus:ring-1 focus:ring-zinc-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-700 dark:text-zinc-400 mb-1 font-medium">
                    Registration Number (Optional)
                  </label>
                  <input
                    type="text"
                    value={registrationNumber}
                    onChange={(e) => setRegistrationNumber(e.target.value)}
                    placeholder="BOM/HSG/12345/2020"
                    className="w-full px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md text-zinc-900 dark:text-white font-mono focus:ring-1 focus:ring-zinc-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-zinc-700 dark:text-zinc-400 mb-1 font-medium">
                    City / State
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="City"
                      className="w-1/2 px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md text-zinc-900 dark:text-white focus:ring-1 focus:ring-zinc-500 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      placeholder="State"
                      className="w-1/2 px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md text-zinc-900 dark:text-white focus:ring-1 focus:ring-zinc-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-700 dark:text-zinc-400 mb-1 font-medium">
                    SaaS Subscription Plan
                  </label>
                  <select
                    value={planId}
                    onChange={(e) => setPlanId(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md text-zinc-900 dark:text-white focus:ring-1 focus:ring-zinc-500 focus:outline-none"
                  >
                    {availablePlans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name} (Max {plan.maxFlatsDefault} flats)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-700 dark:text-zinc-400 mb-1 font-medium">
                    Custom Max Flats (Optional)
                  </label>
                  <input
                    type="number"
                    value={customMaxFlats}
                    onChange={(e) => setCustomMaxFlats(e.target.value)}
                    placeholder="Defaults to plan quota"
                    className="w-full px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md text-zinc-900 dark:text-white font-mono focus:ring-1 focus:ring-zinc-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/80 text-[11px] text-zinc-600 dark:text-zinc-400 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  Creating a society initializes a separate tenant boundary, subscription record, and strict flat quota limit in the shared database.
                </span>
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="w-full sm:w-auto px-3.5 py-2 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-md bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  Provision Society
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
