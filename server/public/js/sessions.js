// =========================================================
// public/js/sessions.js
// Orquesta el timer de sesion (SessionTimer) con las
// llamadas de API de inicio, pausa y fin de sesion.
// =========================================================

import { $, state } from "./config.js";
import { startSession, pauseSession, finishSession, saveSessionLegacy } from "./api.js";
import { SessionTimer } from "./SessionTimer.js";

// Instancia compartida del timer
let _timer = null;
let sessionsBound = false;

// =========================================================
// API DE COMPATIBILIDAD
// =========================================================

export function getActiveSessionId() { return _timer?.sessionId ?? null; }
export function setActiveSessionId(id) { if (_timer) _timer.sessionId = id; }
export function isRunning() { return _timer?.isRunning ?? false; }
export function getAccMs()  { return _timer?.elapsed ?? 0; }

/**
 * Inicializa el timer con el estado del servidor.
 * Combina serverMs con lo persistido en storage,
 * tomando el mayor (servidor = fuente de verdad,
 * storage puede tener un valor mas reciente sin sincronizar).
 *
 * @param {number} initialMs  ms acumulados segun el backend
 * @param {string|null} sessionId  ID de sesion activa en backend
 */
export function initTimer(initialMs = 0, sessionId = null) {
  if (_timer) _timer.destroy();

  const uid = state.currentUserId;

  // Sin UID usamos un timer efimero que no toca storage real
  _timer = new SessionTimer(uid ? String(uid) : "__ephemeral__" + Date.now());
  _timer.init(initialMs, sessionId);

  if (uid && !SessionTimer.storageAvailable) {
    console.warn(
      "[SessionTimer] localStorage no disponible. " +
      "El tiempo de terapia no persistira entre recargas."
    );
  }
}

/** Toggle play/pause — no llama API. */
export function toggleTimer() {
  if (!_timer || !state.currentUserId) return;
  _timer.toggle();
}

// =========================================================
// SESION EN BACKEND
// =========================================================

export async function doStartSession(pacienteId, modoProgamado = "convencional") {
  if (!_timer) return null;

  if (_timer.sessionId) {
    if (!_timer.isRunning) _timer.start();
    return _timer.sessionId;
  }

  try {
    const { ok, data } = await startSession({
      paciente_id:    pacienteId,
      modo_programado: modoProgamado,
      tipo_control:   "tutor",
    });

    if (ok && data.sesion_id) {
      _timer.sessionId = data.sesion_id;
      if (!_timer.isRunning) _timer.start();
      return data.sesion_id;
    }

    if (data?.error === "sesion_ya_activa") {
      _timer.sessionId = data.sesion_id;
      if (!_timer.isRunning) _timer.start();
      return data.sesion_id;
    }
  } catch (err) {
    console.error("[sessions] doStartSession:", err);
  }
  return null;
}

export async function doPauseSession() {
  if (!_timer) return;
  const sid = _timer.sessionId;
  if (!sid) return;

  try { await pauseSession(sid); } catch (err) {
    console.error("[sessions] doPauseSession:", err);
  }
  if (_timer.isRunning) _timer.pause();
}

export async function doFinishSession(motivo = "completada") {
  if (!_timer) return 0;

  const durS = _timer.elapsedSeconds;
  const sid  = _timer.sessionId;

  if (sid) {
    try {
      await finishSession(sid, {
        duracion_s:           durS,
        tiempo_rango_s:       durS,
        tiempo_fuera_rango_s: 0,
        motivo_fin:           motivo,
      });
    } catch (err) {
      console.error("[sessions] doFinishSession:", err);
    }
  }

  _timer.reset();
  return durS;
}

export async function saveSession() {
  if (!_timer) return;

  // Persistir antes de cualquier operacion de red
  _timer.persist();

  if (_timer.sessionId) {
    await doFinishSession("salida_usuario");
    return;
  }

  if (!state.currentUserId) return;
  try {
    await saveSessionLegacy({
      paciente_id:         state.currentUserId,
      duracion_s:          _timer.elapsedSeconds,
      tiempo_rango_s:      0,
      intensidad_promedio: null,
      observaciones:       null,
    });
  } catch (err) {
    console.error("[sessions] saveSession legacy:", err);
  }
}

// =========================================================
// INIT
// =========================================================

export function initSessions() {
  if (sessionsBound) return;
  sessionsBound = true;
  $("timerCard")?.addEventListener("click", toggleTimer);
  // beforeunload lo maneja SessionTimer internamente desde init()
}
