export type Gate = 'pass' | 'warning' | 'block';
export type Severity = 'low' | 'medium' | 'high' | 'critical';

export type ReferenceRunStatus = 'queued' | 'running' | 'succeeded' | 'failed';
export type ReferenceRunMode = 'fixture' | 'custom-analysis' | 'chat';

export type ReferenceEvent = {
  id: string;
  step: number;
  type: 'thought' | 'action' | 'observation' | 'tool' | 'rag' | 'mcp' | 'validation' | 'final' | 'final_output' | string;
  title: string;
  detail: string;
  payload?: Record<string, unknown>;
};

export type PromptOverrides = {
  variant?: string;
  system?: string;
  react_protocol?: string;
  tool_policy?: string;
  output_contract?: string;
};

export type ReferencePromptDefaults = {
  system: string;
  react_protocol: string;
  tool_policy: string;
  output_contract: string;
};

export type ReferenceRun = {
  id: string;
  fixture?: string;
  mode: ReferenceRunMode;
  status: ReferenceRunStatus;
  userInput?: string;
  modelId?: string;
  tracePath?: string;
  reportPath?: string;
  promptVariant?: string;
  promptOverrides?: string[];
  eventCounts: Record<string, number>;
  timeline: ReferenceEvent[];
};

export type Finding = {
  id: string;
  metric: string;
  category: string;
  severity: Severity;
  confidence: number;
  expected: string;
  actual: string;
  recommendation: string;
  evidence: string[];
  runId: string;
  priority?: number;
};

export type AnalysisSummary = {
  sessionId: string;
  runCount: number;
  gateCounts: Record<Gate, number>;
  severityCounts: Record<Severity, number>;
  topFindings: Finding[];
};

export type ToolCall = {
  name: string;
  status: 'success' | 'fallback' | 'error';
  summary: string;
};

export type ChatAction = {
  label: string;
  command: string;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  createdAt: string;
  toolCalls?: ToolCall[];
  focusedFindingId?: string;
  focusedMetric?: string;
  actionButtons?: ChatAction[];
};

export type ConfigSnapshot = {
  configDir: string;
  adapter: string;
  chatMode: string;
  llmProvider: string;
  model: string;
  metricCount: number;
};


export type PromptRegressionSummary = {
  baselineRunId: string;
  candidateRunId: string;
  baselineGate: Gate;
  candidateGate: Gate;
  baselineScore: number;
  candidateScore: number;
  scoreDelta: number;
  gateChanged: boolean;
  gateRegressed: boolean;
  newFindingCount: number;
  newHighCriticalFindingCount: number;
  resolvedFindingCount: number;
  regressionScore: number;
  baselineModel?: string;
  candidateModel?: string;
  modelChanged?: boolean;
};

export type PromptRegression = {
  id: string;
  status: 'succeeded' | 'failed' | 'running' | 'queued';
  summary: PromptRegressionSummary;
  findings: Finding[];
  newFindings: Finding[];
  resolvedFindings: Finding[];
  reportPath?: string;
  jsonPath?: string;
};
