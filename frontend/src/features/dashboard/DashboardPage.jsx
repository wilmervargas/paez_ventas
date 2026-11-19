import { ServerStatus } from "../../components/layout/ServerStatus";
import { useAuth } from "../../context/auth-context";
import { RatesManager } from "../rates/components/RatesManager";

export function DashboardPage() {
  const { user } = useAuth();
  const firstName = user?.nombre.split(/\s+/)[0] ?? "";

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-900 p-6 text-white shadow-lg sm:p-8">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300">
              Panel principal
            </p>
            <h1 className="mt-2 text-xl font-semibold sm:text-2xl">Hola, {firstName}</h1>
          </div>
          <div className="shrink-0 rounded-xl bg-white/10 px-3 py-2 ring-1 ring-white/15 backdrop-blur-sm">
            <ServerStatus />
          </div>
        </div>
      </section>

      <RatesManager />
    </div>
  );
}
