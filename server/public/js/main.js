// =========================================================
// public/js/main.js
// Entry point: inicializa módulos, maneja navegación y
// enruta al dashboard correcto según el rol
// =========================================================

import { $, state } from "./config.js";
import { initAuth, openAuthModal, doLogout, bootstrapFromStorage } from "./auth.js";
import { initSessions } from "./sessions.js";
import { loadPartial, loadAllPartials } from "./partials.js";

// =========================================================
// NAVEGACIÓN
// =========================================================
export function setActiveNav(v) {
  document.querySelectorAll("#publicNav button[data-nav]").forEach(b =>
    b.classList.toggle("active", b.dataset.nav === v)
  );
}

export function navigate(viewName) {
  if (viewName === "login") { openAuthModal(); return; }
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  const target = document.getElementById("view-" + viewName);
  if (target) target.classList.add("active");
  setActiveNav(viewName);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

export function setNavMode(mode) {
  const nav = $("publicNav"); if (!nav) return;
  nav.style.display = mode === "private" ? "none" : "";
}

// =========================================================
// DASHBOARD ROUTER
// =========================================================
function showDash(which) {
  const lb = $("logoutBtn"); if (lb) lb.style.display = "inline-flex";
  setNavMode("private");
  navigate(which === "patient" ? "dashboard-patient" : "dashboard-doctor");
}

export async function enterFromSession(data) {
  const role = data?.chosenRole || (data?.doctor ? "doctor" : data?.paciente ? "tutor" : null);
  if (!role) {
    doLogout(false);
    return;
  }
  state.currentRole = role;

  if (role === "doctor") {
    if (!data?.doctor) {
      doLogout(false);
      return;
    }
    // Garantizar que el partial esté en el DOM antes de navegar
    await loadPartial("doctor-dashboard.html");
    showDash("doctor");
    const { initSocket, socketIdentifyDoctor } = await import("./socket.js");
    initSocket();
    socketIdentifyDoctor(data.doctor.id);
    const { initDoctorDashboard } = await import("./doctor-dashboard.js");
    initDoctorDashboard(data);
    return;
  }

  if (role !== "tutor" || !data?.paciente || !data?.tutor) {
    doLogout(false);
    return;
  }

  // Garantizar que el partial esté en el DOM antes de navegar
  await loadPartial("patient-dashboard.html");
  showDash("patient");

  const { initSocket, socketIdentifyTutor } = await import("./socket.js");
  initSocket();
  socketIdentifyTutor(data.tutor.id, data.paciente.id);

  const { initPatientDashboard } = await import("./patient-dashboard.js");
  await initPatientDashboard(data);
}

// =========================================================
// BIND BOTONES DE NAVEGACIÓN
// =========================================================
function bindNavButtons() {
  // Brand / logo → home
  $("brandHome")?.addEventListener("click", () => navigate("home"));
  $("brandHome")?.addEventListener("keydown", e => { if (e.key === "Enter") navigate("home"); });

  // Nav links
  $("navHome")?.addEventListener("click",     () => navigate("home"));
  $("navLogin")?.addEventListener("click",    () => openAuthModal());
  $("navHistoria")?.addEventListener("click", () => navigate("historia"));
  $("navContacto")?.addEventListener("click", () => navigate("contacto"));

  // Hero CTA
  $("heroLoginBtn")?.addEventListener("click",    () => openAuthModal());
  $("historiaLoginBtn")?.addEventListener("click",() => openAuthModal("loginView"));

  // Footer links
  $("footerLogin")?.addEventListener("click",    () => openAuthModal());
  $("footerHistoria")?.addEventListener("click", () => navigate("historia"));
  $("footerContacto")?.addEventListener("click", () => navigate("contacto"));
  $("footerHome")?.addEventListener("click",     () => navigate("home"));
}

// =========================================================
// INIT
// =========================================================
async function init() {
  bindNavButtons();

  // Cargar auth modal primero — initAuth lo necesita en el DOM
  await loadPartial("auth-modal.html");
  initAuth();
  initSessions();

  // Navegar a home
  navigate("home");

  // Precargar dashboards en segundo plano mientras el usuario
  // está en la landing, para que al hacer login estén listos
  if (typeof requestIdleCallback !== "undefined") {
    requestIdleCallback(() => loadAllPartials());
  } else {
    setTimeout(() => loadAllPartials(), 1000);
  }

  // Restaurar sesión desde localStorage
  await bootstrapFromStorage();
}

// Arrancar cuando el DOM esté listo
document.addEventListener("DOMContentLoaded", init);
