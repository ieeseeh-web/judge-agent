import { useState } from 'react';

export type PromptHistoryEntry = {
  id: string;
  savedAt: string;
  variant: string;
  system: string;
  toolPolicy: string;
  outputContract: string;
};

const STORAGE_KEY = 'judge-agent:prompt-history';
const MAX_ENTRIES = 30;

function loadFromStorage(): PromptHistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function usePromptHistory() {
  const [history, setHistory] = useState<PromptHistoryEntry[]>(loadFromStorage);

  const save = (entry: Omit<PromptHistoryEntry, 'id' | 'savedAt'>): void => {
    // Skip if identical to the most recent entry
    const latest = loadFromStorage()[0];
    if (
      latest &&
      latest.variant === entry.variant &&
      latest.system === entry.system &&
      latest.toolPolicy === entry.toolPolicy &&
      latest.outputContract === entry.outputContract
    ) return;

    const newEntry: PromptHistoryEntry = {
      id: Date.now().toString(),
      savedAt: new Date().toISOString(),
      ...entry,
    };
    setHistory(prev => {
      const updated = [newEntry, ...prev].slice(0, MAX_ENTRIES);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  const remove = (id: string): void => {
    setHistory(prev => {
      const updated = prev.filter(e => e.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  const clear = (): void => {
    localStorage.removeItem(STORAGE_KEY);
    setHistory([]);
  };

  return { history, save, remove, clear };
}
