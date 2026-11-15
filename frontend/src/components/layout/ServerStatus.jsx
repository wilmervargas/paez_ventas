import { useEffect, useState } from "react";

const SERVICES = [
  {
    key: "ws",
    label: "WS",
    port: 3000,
    url: "http://127.0.0.1:3000/api/whatsapp/status",
  },
  {
    key: "backend",
    label: "API",
    port: 8000,
    url: "http://127.0.0.1:8000/api/v1/",
  },
];

function getFrontendService() {
  const port = Number(window.location.port) || (window.location.protocol === "https:" ? 443 : 80);
  return {
    key: "frontend",
    label: "Front",
    port,
    url: window.location.origin,
  };
}

async function checkService(service) {
  // El frontend que sirve esta página está activo si estamos aquí.
  if (service.key === "frontend") return true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(service.url, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });
    // Cualquier respuesta HTTP (incluso 401/404) indica que el servidor responde.
    return res.status > 0;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function ServerStatus({ className = "" }) {
  const [status, setStatus] = useState(() => {
    const initial = {};
    for (const s of [...SERVICES, getFrontendService()]) initial[s.key] = null;
    return initial;
  });

  useEffect(() => {
    let cancelled = false;
    const services = [...SERVICES, getFrontendService()];

    async function run() {
      const entries = await Promise.all(
        services.map(async (s) => [s.key, await checkService(s)])
      );
      if (!cancelled) {
        setStatus((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
      }
    }

    run();
    const id = setInterval(run, 20000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const services = [...SERVICES, getFrontendService()];

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 ${className}`} aria-label="Estado de servidores">
      {services.map((s) => {
        const up = status[s.key];
        const color =
          up === null
            ? "bg-slate-300"
            : up
              ? "bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.25)]"
              : "bg-rose-500 shadow-[0_0_0_2px_rgba(244,63,94,0.25)]";
        const title =
          up === null
            ? `${s.label} :${s.port} (comprobando)`
            : up
              ? `${s.label} :${s.port} activo`
              : `${s.label} :${s.port} inactivo`;
        return (
          <div key={s.key} className="flex items-center gap-1.5" title={title}>
            <span
              className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${color}`}
              aria-hidden="true"
            />
            <span className="text-xs font-medium text-white/90">
              {s.label} <span className="text-white/60">:{s.port}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
