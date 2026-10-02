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
  // Шаг 2 (второй фактор): храним challenge и маскированный адрес.
  const [stage, setStage] = useState<"password" | "code">("password");
  const [challengeId, setChallengeId] = useState("");
  const [maskedTo, setMaskedTo] = useState("");
  const [code, setCode] = useState("");
  const [resent, setResent] = useState(false);

  function finish() {
    router.replace(from);
    router.refresh();
  }

  async function submitPassword(e: React.FormEvent) {
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
        const data = await res.json();
        if (data.twofa) {
          setChallengeId(data.challengeId);
          setMaskedTo(data.to || "");
          setStage("code");
          setLoading(false);
          return;
        }
        finish();
        return;
      }
      if (res.status === 401) setError("Неверный пароль");
      else if (res.status === 500) {
        const d = await res.json().catch(() => ({}));
        setError(d.error === "mail_failed" ? "Не удалось отправить код на почту. Попробуйте позже." : "Ошибка сервера. Проверьте, что выполнен «npx prisma generate».");
      } else setError("Ошибка сервера");
    } catch {
      setError("Не удалось связаться с сервером");
    }
    setLoading(false);
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId, code }),
      });
      if (res.ok) {
        finish();
        return;
      }
      setError(res.status === 401 ? "Неверный или просроченный код" : "Ошибка сервера");
    } catch {
      setError("Не удалось связаться с сервером");
    }
    setLoading(false);
  }

  async function resend() {
    setError(null);
    setResent(false);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.twofa) {
        setChallengeId(data.challengeId);
        setCode("");
        setResent(true);
      } else {
        setError("Не удалось отправить код повторно");
      }
    } catch {
      setError("Не удалось связаться с сервером");
    }
  }

  const Brand = (
    <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 22 }}>
      <div style={{ width: 34, height: 34, borderRadius: 9, background: "var(--brand)", display: "grid", placeItems: "center" }}>
        <span className="mono" style={{ color: "var(--brand-ink)", fontSize: 17, fontWeight: 600 }}>
          Ф
        </span>
      </div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: ".02em" }}>ФИНАНСЫ</div>
        <div className="k" style={{ fontSize: 9 }}>
          {stage === "code" ? "подтверждение входа" : "вход в дашборд"}
        </div>
      </div>
    </div>
  );

  if (stage === "code") {
    return (
      <div className="login-wrap ds">
        <form className="login-card" onSubmit={submitCode}>
          {Brand}
          <div className="h-sub" style={{ marginBottom: 14, fontSize: 12.5, color: "var(--muted)" }}>
            Мы отправили 6-значный код на почту{maskedTo ? <> <b style={{ color: "var(--ink-2)" }}>{maskedTo}</b></> : null}. Введите его, чтобы войти.
          </div>
          <label className="fld" style={{ marginBottom: 14 }}>
            <span className="k">Код из письма</span>
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              autoComplete="one-time-code"
              placeholder="______"
              maxLength={6}
              className={`mono ${error ? "err" : ""}`}
              style={{ letterSpacing: 6, fontSize: 18, textAlign: "center" }}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                setError(null);
              }}
            />
          </label>

          {error && <div style={{ color: "var(--neg)", fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
          {resent && !error && <div style={{ color: "var(--pos)", fontSize: 12.5, marginBottom: 12 }}>Код отправлен повторно.</div>}

          <button className="btn primary" type="submit" disabled={loading || code.length < 6} style={{ width: "100%", justifyContent: "center" }}>
            {loading ? "Проверяем…" : "Подтвердить"}
          </button>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14 }}>
            <button type="button" onClick={() => { setStage("password"); setCode(""); setError(null); }} style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 12, cursor: "pointer", fontFamily: "var(--sans)" }}>
              ← Назад
            </button>
            <button type="button" onClick={resend} style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 12, cursor: "pointer", fontFamily: "var(--sans)" }}>
              Отправить код ещё раз
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="login-wrap ds">
      <form className="login-card" onSubmit={submitPassword}>
        {Brand}
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

        {error && <div style={{ color: "var(--neg)", fontSize: 12.5, marginBottom: 12 }}>{error}</div>}

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
