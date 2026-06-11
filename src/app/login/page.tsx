"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const from = params.get("from") || "/";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.replace(from);
        router.refresh();
        return;
      }
      if (res.status === 401) {
        setError("Неверный пароль");
      } else if (res.status === 429) {
        const retry = Number(res.headers.get("Retry-After")) || 60;
        setError(`Слишком много попыток входа. Повторите через ${retry} с.`);
      } else {
        setError("Ошибка сервера. Проверьте, что выполнен «npx prisma generate».");
      }
    } catch {
      setError("Не удалось связаться с сервером");
    }
    setLoading(false);
  }

  return (
    <div className="login-wrap ds">
      <form className="login-card" onSubmit={submit}>
        <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 22 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: "var(--brand)", display: "grid", placeItems: "center" }}>
            <span className="mono" style={{ color: "var(--brand-ink)", fontSize: 17, fontWeight: 600 }}>
              К
            </span>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: ".02em" }}>КАПИТАЛ</div>
            <div className="k" style={{ fontSize: 9 }}>
              вход в дашборд
            </div>
          </div>
        </div>

        <label className="fld" style={{ marginBottom: 14 }}>
          <span className="k">Пароль</span>
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            placeholder="••••••••"
            className={error ? "err" : ""}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
          />
        </label>

        {error && (
          <div style={{ color: "var(--neg)", fontSize: 12.5, marginBottom: 12 }}>{error}</div>
        )}

        <button className="btn primary" type="submit" disabled={loading} style={{ width: "100%", justifyContent: "center" }}>
          {loading ? "Вход…" : "Войти"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
