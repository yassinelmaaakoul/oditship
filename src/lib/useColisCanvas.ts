import { useEffect, useState } from "react";
import {
  COLIS_CANVAS_SETTING_KEY,
  defaultColisCanvasSettings,
  normalizeColisCanvasSettings,
  type ColisCanvasSettings,
  type ColisCanvasSurface,
} from "@/lib/colisCanvas";
import { getAppSetting, invalidateAppSetting } from "@/lib/appSettingsCache";

let cached: ColisCanvasSettings | null = null;
let pending: Promise<ColisCanvasSettings> | null = null;
const listeners = new Set<(s: ColisCanvasSettings) => void>();

export const loadCanvasSettings = async (): Promise<ColisCanvasSettings> => {
  if (cached) return cached;
  if (!pending) {
    pending = getAppSetting(COLIS_CANVAS_SETTING_KEY).then((value) => {
      cached = normalizeColisCanvasSettings(value);
      pending = null;
      return cached;
    });
  }
  return pending;
};

export const setCanvasSettingsCache = (settings: ColisCanvasSettings) => {
  cached = settings;
  listeners.forEach((listener) => listener(settings));
};

export const invalidateCanvasSettings = () => {
  cached = null;
  pending = null;
  invalidateAppSetting(COLIS_CANVAS_SETTING_KEY);
};

export const useCanvasSettings = (): ColisCanvasSettings => {
  const [settings, setSettings] = useState<ColisCanvasSettings>(
    cached ?? defaultColisCanvasSettings
  );
  useEffect(() => {
    let alive = true;
    loadCanvasSettings().then((s) => alive && setSettings(s));
    listeners.add(setSettings);
    return () => {
      alive = false;
      listeners.delete(setSettings);
    };
  }, []);
  return settings;
};

export const useCanvasSurface = (surface: ColisCanvasSurface) => useCanvasSettings()[surface];
