import type { AnalysisSummary, ChatMessage, ConfigSnapshot, PromptOverrides, PromptRegression, ReferencePromptDefaults, ReferenceRun } from '../types/judge';

const BASE_URL = import.meta.env.VITE_JUDGE_API_BASE_URL || 'http://localhost:19001';

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || 'API request failed');
  }
  return response.json();
}

export async function getConfig(): Promise<ConfigSnapshot> {
  const data = await apiFetch<any>('/api/config');
  return {
    configDir: data.configDir,
    adapter: data.appDefaults?.adapter || 'reference-weblog-jsonl',
    chatMode: data.appDefaults?.chat_mode || 'deterministic-v2',
    llmProvider: data.llmProfiles?.defaultProvider || 'none',
    model: data.llmProfiles?.defaultModel || '',
    metricCount: data.metrics?.count || 0,
  };
}


export async function getReferencePrompts(): Promise<ReferencePromptDefaults> {
  const data = await apiFetch<any>('/api/reference/prompts');
  return data.prompts;
}

export async function getFixtures(): Promise<any[]> {
  const data = await apiFetch<any>('/api/reference/fixtures');
  return data.fixtures || [];
}

export async function getModels(): Promise<{ models: any[]; defaultModel: string }> {
  return apiFetch<any>('/api/models');
}

export async function getRuns(params?: {
  fixture?: string;
  modelId?: string;
  status?: string;
  limit?: number;
}): Promise<{ runs: any[]; total: number }> {
  const q = new URLSearchParams();
  if (params?.fixture)  q.set('fixture', params.fixture);
  if (params?.modelId)  q.set('modelId', params.modelId);
  if (params?.status)   q.set('status', params.status);
  if (params?.limit)    q.set('limit', String(params.limit));
  return apiFetch<any>(`/api/reference/runs?${q.toString()}`);
}

function mapRun(run: any): ReferenceRun {
  return {
    id: run.id,
    fixture: run.fixtureId,
    mode: run.mode,
    status: run.status,
    userInput: run.userInput,
    modelId: run.modelId,
    tracePath: run.tracePath,
    reportPath: run.reportPath,
    promptVariant: run.promptVariant,
    promptOverrides: run.promptOverrides,
    eventCounts: run.eventCounts,
    timeline: (run.timelinePreview || []).map((ev: any, idx: number) => ({
      id: `ev-${idx}`,
      step: idx + 1,
      type: ev.type,
      title: ev.title,
      detail: ev.detail,
    })),
  };
}

export async function runReferenceAgent(fixtureId: string, useLlm: boolean = false, promptOverrides?: PromptOverrides): Promise<ReferenceRun> {
  const data = await apiFetch<any>('/api/reference/runs', {
    method: 'POST',
    body: JSON.stringify({ mode: 'fixture', fixtureId, useLlm, promptOverrides }),
  });
  return mapRun(data.run);
}

export async function runReferenceAgentCustom(userInput: string, useLlm: boolean = true, promptOverrides?: PromptOverrides, modelId?: string): Promise<ReferenceRun> {
  const data = await apiFetch<any>('/api/reference/runs', {
    method: 'POST',
    body: JSON.stringify({ mode: 'custom-analysis', userInput, useLlm, promptOverrides, modelId: modelId || undefined }),
  });
  return mapRun(data.run);
}

export async function createAnalysis(referenceRunId: string, adapter: string): Promise<any> {
  const data = await apiFetch<any>('/api/analyses', {
    method: 'POST',
    body: JSON.stringify({
      source: { kind: 'reference-run', referenceRunId },
      adapter,
    }),
  });
  return data.analysis;
}


export async function createPromptRegression(baselineReferenceRunId: string, candidateReferenceRunId: string, adapter: string): Promise<PromptRegression> {
  const data = await apiFetch<any>('/api/prompt-regressions', {
    method: 'POST',
    body: JSON.stringify({
      baseline: { referenceRunId: baselineReferenceRunId },
      candidate: { referenceRunId: candidateReferenceRunId },
      adapter,
    }),
  });
  const regression = data.regression;
  return {
    id: regression.id,
    status: regression.status,
    summary: regression.summary,
    findings: regression.findings || [],
    newFindings: regression.newFindings || [],
    resolvedFindings: regression.resolvedFindings || [],
    reportPath: regression.reportPath,
    jsonPath: regression.jsonPath,
  };
}

export async function createJudgeSession(analysisId: string, mode: string): Promise<any> {
  const data = await apiFetch<any>('/api/judge/sessions', {
    method: 'POST',
    body: JSON.stringify({
      analysisId,
      mode,
      sessionId: `session-${Date.now()}`,
    }),
  });
  return data.session;
}

export async function sendJudgeMessage(sessionId: string, content: string): Promise<{ message: ChatMessage; session: any }> {
  return apiFetch<{ message: ChatMessage; session: any }>(`/api/judge/sessions/${sessionId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

// Keep mocks for fallback if needed or initial state
export const mockReferenceRun: ReferenceRun = {
  id: 'ref-normal-login-error-spike-001',
  fixture: 'normal-login-error-spike',
  mode: 'fixture',
  status: 'succeeded',
  tracePath: 'reference_agent/weblog_agent/traces/normal-login-error-spike.jsonl',
  reportPath: 'reference_agent/weblog_agent/reports/normal-login-error-spike.md',
  eventCounts: {
    react_step: 9,
    tool_end: 7,
    mcp_end: 1,
    validation_result: 1,
    final_output: 1,
  },
  timeline: [],
};

export const mockSummary: AnalysisSummary = {
  sessionId: 'weblog-drift-review',
  runCount: 0,
  gateCounts: { pass: 0, warning: 0, block: 0 },
  severityCounts: { low: 0, medium: 0, high: 0, critical: 0 },
  topFindings: [],
};

export const mockConfig: ConfigSnapshot = {
  configDir: 'simple/config',
  adapter: 'reference-weblog-jsonl',
  chatMode: 'deterministic-v2',
  llmProvider: 'none',
  model: '',
  metricCount: 0,
};

export function getMockReviewData() {
  return {
    referenceRun: mockReferenceRun,
    summary: mockSummary,
    findings: [],
    messages: [],
    config: mockConfig,
  };
}
