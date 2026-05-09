import { getAppSetting, invalidateAppSetting } from "./appSettingsCache";

export const STATUS_BADGE_OVERRIDES_KEY = "status_badge_overrides";

export type StatusBadgeOverride = { bg: string; text: string; border?: string };
export type StatusBadgeOverrides = Record<string, StatusBadgeOverride>;

const SESSION_KEY = `app_settings:${STATUS_BADGE_OVERRIDES_KEY}`;

let cache: StatusBadgeOverrides | null = null;

function readSync(): StatusBadgeOverrides {
  if (cache) return cache;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.value === "object" && parsed.value) {
        cache = parsed.value as StatusBadgeOverrides;
        return cache;
      }
    }
  } catch { /* */ }
  cache = {};
  return cache;
}

export function getStatusBadgeOverride(status: string): StatusBadgeOverride | null {
  const map = readSync();
  return map?.[status] ?? null;
}

export async function preloadStatusBadgeOverrides(): Promise<StatusBadgeOverrides> {
  const value = (await getAppSetting<StatusBadgeOverrides>(STATUS_BADGE_OVERRIDES_KEY)) || {};
  cache = value;
  return value;
}

export function invalidateStatusBadgeOverrides() {
  cache = null;
  invalidateAppSetting(STATUS_BADGE_OVERRIDES_KEY);
}
