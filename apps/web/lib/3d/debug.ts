"use client";

type DebugOptions = {
  intervalMs?: number;
  once?: boolean;
};

const DEBUG_STORAGE_KEY = "control3d.debug3d";
const DEBUG_LOGS_STORAGE_KEY = "control3d.debug3d.logs";
const DEBUG_LOG_LIMIT_STORAGE_KEY = "control3d.debug3d.logLimit";
const DEFAULT_LOG_LIMIT = 500;
const lastLogAt = new Map<string, number>();
let logSequence = 0;

type DebugLogRecord = {
  id: number;
  key: string;
  message: string;
  data?: unknown;
  timestamp: string;
  timeMs: number;
};

declare global {
  interface Window {
    Control3DDebug?: {
      clear: () => void;
      export: () => string;
      logs: () => DebugLogRecord[];
      storageKey: string;
    };
  }
}

function isDebug3DEnabled() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const paramValue = new URLSearchParams(window.location.search).get("debug3d");
    if (paramValue === "0" || paramValue === "false") return false;
    return window.localStorage.getItem(DEBUG_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

function getLogLimit() {
  if (typeof window === "undefined") return DEFAULT_LOG_LIMIT;
  const rawLimit = window.localStorage.getItem(DEBUG_LOG_LIMIT_STORAGE_KEY);
  const parsedLimit = rawLimit ? Number(rawLimit) : DEFAULT_LOG_LIMIT;
  return Number.isFinite(parsedLimit) && parsedLimit > 0
    ? Math.floor(parsedLimit)
    : DEFAULT_LOG_LIMIT;
}

function readStoredLogs(): DebugLogRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const rawLogs = window.localStorage.getItem(DEBUG_LOGS_STORAGE_KEY);
    if (!rawLogs) return [];
    const parsedLogs = JSON.parse(rawLogs);
    return Array.isArray(parsedLogs) ? parsedLogs : [];
  } catch {
    return [];
  }
}

function syncLogSequence(logs: DebugLogRecord[]) {
  const maxStoredId = logs.reduce((maxId, log) => (
    typeof log.id === "number" && log.id > maxId ? log.id : maxId
  ), 0);
  if (maxStoredId > logSequence) {
    logSequence = maxStoredId;
  }
}

function toSerializable(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === undefined) return "__undefined__";
  if (value === null) return null;

  const valueType = typeof value;
  if (valueType === "number") {
    if (Number.isNaN(value)) return "__NaN__";
    if (value === Infinity) return "__Infinity__";
    if (value === -Infinity) return "__-Infinity__";
    return value;
  }
  if (valueType === "string" || valueType === "boolean") return value;
  if (valueType === "bigint") return value.toString();
  if (valueType === "function" || valueType === "symbol") return String(value);

  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((entry) => toSerializable(entry, seen));

  if (typeof value === "object") {
    if (seen.has(value)) return "__circular__";
    seen.add(value);

    const output: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)) {
      output[entryKey] = toSerializable(entryValue, seen);
    }
    return output;
  }

  return String(value);
}

function persistLog(record: DebugLogRecord) {
  if (typeof window === "undefined") return;

  const serializedRecord = toSerializable(record) as DebugLogRecord;
  const existingLogs = readStoredLogs();
  syncLogSequence(existingLogs);
  const logs = [...existingLogs, serializedRecord];
  const limit = getLogLimit();
  const trimmedLogs = logs.length > limit ? logs.slice(logs.length - limit) : logs;

  try {
    window.localStorage.setItem(DEBUG_LOGS_STORAGE_KEY, JSON.stringify(trimmedLogs, null, 2));
  } catch {
    const smallerLogs = trimmedLogs.slice(Math.floor(trimmedLogs.length / 2));
    try {
      window.localStorage.setItem(DEBUG_LOGS_STORAGE_KEY, JSON.stringify(smallerLogs, null, 2));
    } catch {
      window.localStorage.removeItem(DEBUG_LOGS_STORAGE_KEY);
    }
  }
}

function installDebugHelpers() {
  if (typeof window === "undefined" || window.Control3DDebug) return;

  window.Control3DDebug = {
    clear: () => window.localStorage.removeItem(DEBUG_LOGS_STORAGE_KEY),
    export: () => JSON.stringify(readStoredLogs(), null, 2),
    logs: readStoredLogs,
    storageKey: DEBUG_LOGS_STORAGE_KEY,
  };
}

export function log3DDebug(key: string, message: string, data?: unknown, options: DebugOptions = {}) {
  if (!isDebug3DEnabled()) return;
  installDebugHelpers();

  const now = typeof performance === "undefined" ? Date.now() : performance.now();
  const last = lastLogAt.get(key);
  if (options.once && last !== undefined) return;
  if (last !== undefined && options.intervalMs !== undefined && now - last < options.intervalMs) return;

  lastLogAt.set(key, now);
  syncLogSequence(readStoredLogs());
  const record: DebugLogRecord = {
    id: ++logSequence,
    key,
    message,
    ...(data === undefined ? {} : { data }),
    timestamp: new Date().toISOString(),
    timeMs: Number(now.toFixed(2)),
  };
  persistLog(record);

  console.info(
    `[control3d:3d #${record.id}] ${message} | key=${key} | full: window.Control3DDebug.logs()`,
  );
}
