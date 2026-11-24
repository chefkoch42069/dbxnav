// Gemeinsamer Fetch mit Timeout und verständlichen Fehlermeldungen.
export async function getJSON(url, { timeout = 30000, signal } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  if (signal) signal.addEventListener("abort", () => ctrl.abort(), { once: true });
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (res.status === 429) throw new Error("Zu viele Anfragen – bitte kurz warten.");
    if (!res.ok) throw new Error(`Server antwortet mit ${res.status}`);
    return await res.json();
  } catch (e) {
    if (e.name === "AbortError") throw new Error(signal?.aborted ? "Abgebrochen" : "Zeitüberschreitung – Server antwortet nicht.");
    if (e instanceof TypeError) throw new Error(navigator.onLine === false ? "Offline – keine Verbindung." : "Netzwerkfehler.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
