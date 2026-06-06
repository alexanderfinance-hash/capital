"use client";

export function toggleTheme() {
  const cur = document.body.getAttribute("data-theme") === "dark" ? "dark" : "light";
  const next = cur === "dark" ? "light" : "dark";
  document.body.setAttribute("data-theme", next);
  try {
    localStorage.setItem("cap-theme", next);
  } catch {}
}
