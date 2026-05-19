import { useState } from 'react';

export type ModelInfo = {
  id: string;
  provider: string;
  source: 'running' | 'config' | string;
  size?: string;
  quantization?: string;
};

const STORAGE_KEY = 'judge-agent:model-settings';

function loadSettings(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveSettings(s: Record<string, boolean>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function useModelSettings() {
  // { [modelId]: true/false } — 명시적 false만 저장, 없으면 기본값 true
  const [settings, setSettings] = useState<Record<string, boolean>>(loadSettings);

  const isEnabled = (id: string): boolean => settings[id] !== false;

  const setEnabled = (id: string, enabled: boolean) => {
    setSettings(prev => {
      const next = { ...prev, [id]: enabled };
      saveSettings(next);
      return next;
    });
  };

  const enableAll = (ids: string[]) => {
    setSettings(prev => {
      const next = { ...prev };
      ids.forEach(id => { next[id] = true; });
      saveSettings(next);
      return next;
    });
  };

  const disableAll = (ids: string[]) => {
    setSettings(prev => {
      const next = { ...prev };
      ids.forEach(id => { next[id] = false; });
      saveSettings(next);
      return next;
    });
  };

  return { isEnabled, setEnabled, enableAll, disableAll };
}
