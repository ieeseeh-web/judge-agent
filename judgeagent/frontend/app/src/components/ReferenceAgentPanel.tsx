import { useState, useEffect, useRef } from 'react';
import type { PromptOverrides, ReferencePromptDefaults, ReferenceRun } from '../types/judge';
import { Card, Select, Button, Space, Typography, Tag, Modal, Input, Tabs, Tooltip, Popconfirm, Empty, Spin, Collapse } from 'antd';
import {
  ExperimentOutlined, BranchesOutlined, FlagOutlined, EditOutlined,
  DeleteOutlined, HistoryOutlined, RollbackOutlined, RobotOutlined,
  UserOutlined, SettingOutlined, SendOutlined,
} from '@ant-design/icons';
import { usePromptHistory } from '../hooks/usePromptHistory';
import type { PromptHistoryEntry } from '../hooks/usePromptHistory';
import * as api from '../api/judgeClient';

const { Title, Text } = Typography;

type RefChatTurn = {
  id: string;
  userMessage: string;
  run?: ReferenceRun;
  status: 'running' | 'succeeded' | 'failed';
  error?: string;
  timestamp: string;
};

type FixtureOption = { value: string; label: string; userInput: string };

type ReferenceAgentPanelProps = {
  referenceRun: ReferenceRun;
  onRun: (run: ReferenceRun) => void;
  onJudge: () => void;
  onSetBaseline: () => void;
  onComparePromptRegression: () => void;
  baselineRun: ReferenceRun | null;
  defaultPrompts: ReferencePromptDefaults | null;
  isLoading?: boolean;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function HistoryList({ history, onLoad, onRemove, onClear }: {
  history: PromptHistoryEntry[];
  onLoad: (entry: PromptHistoryEntry) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  if (history.length === 0) {
    return <Empty description="저장된 히스토리가 없습니다" style={{ padding: '32px 0' }} />;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Popconfirm title="전체 히스토리를 삭제할까요?" onConfirm={onClear} okText="삭제" cancelText="취소">
          <Button size="small" danger icon={<DeleteOutlined />}>전체 삭제</Button>
        </Popconfirm>
      </div>
      {history.map((entry) => {
        const fields = [
          entry.system && 'system',
          entry.toolPolicy && 'tool_policy',
          entry.outputContract && 'output_contract',
        ].filter(Boolean) as string[];
        return (
          <div key={entry.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', background: '#fafafa', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: '0.72rem', color: '#94a3b8', flexShrink: 0 }}>{formatDate(entry.savedAt)}</Text>
                <Tag color="blue" style={{ fontSize: '0.7rem', margin: 0 }}>{entry.variant}</Tag>
                {fields.map(f => <Tag key={f} style={{ fontSize: '0.68rem', margin: 0 }}>{f}</Tag>)}
              </div>
              {entry.system && (
                <Text type="secondary" style={{ fontSize: '0.75rem', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {entry.system.slice(0, 80)}…
                </Text>
              )}
            </div>
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              <Tooltip title="이 프롬프트 불러오기">
                <Button size="small" icon={<RollbackOutlined />} onClick={() => onLoad(entry)}>Load</Button>
              </Tooltip>
              <Tooltip title="삭제">
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => onRemove(entry.id)} />
              </Tooltip>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AgentBubble({ turn }: { turn: RefChatTurn }) {
  if (turn.status === 'running') {
    return (
      <div style={{ alignSelf: 'flex-start', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', borderBottomLeftRadius: 2, padding: '14px 16px', maxWidth: '100%', width: '100%', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Spin size="small" />
          <Text type="secondary" style={{ fontSize: '0.82rem' }}>분석 중…</Text>
        </div>
      </div>
    );
  }

  if (turn.status === 'failed' || !turn.run) {
    return (
      <div style={{ alignSelf: 'flex-start', background: '#fff2f0', border: '1px solid #ffa39e', borderRadius: '12px', borderBottomLeftRadius: 2, padding: '14px 16px', maxWidth: '100%' }}>
        <Text type="danger">{turn.error || '실행 실패'}</Text>
      </div>
    );
  }

  const { run } = turn;
  const internalEvents = run.timeline.filter(e => e.type !== 'final' && e.type !== 'final_output');
  const finalEvent = run.timeline.find(e => e.type === 'final' || e.type === 'final_output');

  return (
    <div style={{ alignSelf: 'flex-start', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', borderBottomLeftRadius: 2, padding: '16px', maxWidth: '100%', width: '100%', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <RobotOutlined style={{ color: '#52c41a', fontSize: 15 }} />
        <Text style={{ fontSize: '0.78rem', color: '#52c41a', fontWeight: 600 }}>REFERENCE AGENT</Text>
        <Tag color={run.status === 'succeeded' ? 'success' : 'error'} style={{ margin: 0, fontSize: '0.65rem' }}>{run.status.toUpperCase()}</Tag>
        {run.modelId && (
          <Tag color="purple" style={{ margin: 0, fontSize: '0.65rem' }}>{run.modelId}</Tag>
        )}
        {run.promptVariant && run.promptVariant !== 'default' && (
          <Tag color="blue" style={{ margin: 0, fontSize: '0.65rem' }}>{run.promptVariant}</Tag>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {Object.entries(run.eventCounts).map(([k, v]) => (
            <Tag key={k} style={{ margin: 0, fontSize: '0.62rem' }}>{k} <strong>{v}</strong></Tag>
          ))}
        </div>
      </div>

      {internalEvents.length > 0 && (
        <Collapse
          ghost
          size="small"
          style={{ background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8, marginBottom: 12 }}
          items={[{
            key: '1',
            label: (
              <Text type="secondary" style={{ fontSize: '0.8rem', fontWeight: 500 }}>
                <SettingOutlined style={{ marginRight: 6 }} />Thinking Process ({internalEvents.length} steps)
              </Text>
            ),
            children: (
              <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {internalEvents.map(event => (
                  <div key={event.id} style={{ fontSize: '0.82rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <Tag style={{ margin: 0, fontSize: '0.62rem' }}>{event.type.toUpperCase()}</Tag>
                      <Text strong style={{ color: '#334155', fontSize: '0.82rem' }}>{event.title}</Text>
                    </div>
                    <div style={{ color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingLeft: 8, borderLeft: '2px solid #e2e8f0', marginLeft: 4 }}>
                      {event.detail}
                    </div>
                  </div>
                ))}
              </div>
            ),
          }]}
        />
      )}

      <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.65, color: '#1e293b', fontSize: '0.88rem' }}>
        {finalEvent ? finalEvent.detail : (
          run.status === 'failed'
            ? <Text type="danger">에이전트 실행 실패</Text>
            : <Text type="secondary" style={{ fontStyle: 'italic' }}>최종 응답 없음</Text>
        )}
      </div>
    </div>
  );
}

export function ReferenceAgentPanel({
  referenceRun, onRun, onJudge, onSetBaseline, onComparePromptRegression,
  baselineRun, defaultPrompts, isLoading,
}: ReferenceAgentPanelProps) {
  const [chatTurns, setChatTurns] = useState<RefChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [selectedMode, setSelectedMode] = useState('hybrid');
  const [selectedModelId, setSelectedModelId] = useState('');
  const [fixtures, setFixtures] = useState<FixtureOption[]>([]);

  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<'edit' | 'history'>('edit');
  const [promptVariant, setPromptVariant] = useState('candidate-edit');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [toolPolicy, setToolPolicy] = useState('');
  const [outputContract, setOutputContract] = useState('');
  const { history, save, remove, clear } = usePromptHistory();

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getFixtures().then((list: any[]) =>
      setFixtures(list.map(f => ({ value: f.id, label: f.id, userInput: f.userInput })))
    ).catch(() => {});
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatTurns]);

  const changedPromptOverrides = (): PromptOverrides | undefined => {
    const overrides: PromptOverrides = { variant: promptVariant || 'candidate-edit' };
    if (systemPrompt.trim() && systemPrompt !== defaultPrompts?.system) overrides.system = systemPrompt;
    if (toolPolicy.trim() && toolPolicy !== defaultPrompts?.tool_policy) overrides.tool_policy = toolPolicy;
    if (outputContract.trim() && outputContract !== defaultPrompts?.output_contract) overrides.output_contract = outputContract;
    return Object.keys(overrides).length > 1 ? overrides : undefined;
  };

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || isRunning) return;
    setInput('');

    const turnId = `turn-${Date.now()}`;
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setChatTurns(prev => [...prev, { id: turnId, userMessage: msg, status: 'running', timestamp }]);
    setIsRunning(true);

    try {
      const run = await api.runReferenceAgentCustom(msg, selectedMode === 'hybrid', changedPromptOverrides(), selectedModelId.trim() || undefined);
      setChatTurns(prev => prev.map(t =>
        t.id === turnId ? { ...t, run, status: run.status === 'succeeded' ? 'succeeded' : 'failed' } : t
      ));
      onRun(run);
    } catch (e: any) {
      setChatTurns(prev => prev.map(t =>
        t.id === turnId ? { ...t, status: 'failed', error: String(e?.message || e) } : t
      ));
    } finally {
      setIsRunning(false);
    }
  };

  const handleFixtureSelect = (fixtureId: string) => {
    const found = fixtures.find(f => f.value === fixtureId);
    if (found) setInput(found.userInput);
  };

  const loadDefaultPrompts = () => {
    if (!defaultPrompts) return;
    setSystemPrompt(defaultPrompts.system);
    setToolPolicy(defaultPrompts.tool_policy);
    setOutputContract(defaultPrompts.output_contract);
  };

  const handleDone = () => {
    if (systemPrompt.trim() || toolPolicy.trim() || outputContract.trim()) {
      save({ variant: promptVariant || 'candidate-edit', system: systemPrompt, toolPolicy, outputContract });
    }
    setPromptModalOpen(false);
    setModalTab('edit');
  };

  const handleLoadHistory = (entry: PromptHistoryEntry) => {
    setPromptVariant(entry.variant);
    setSystemPrompt(entry.system);
    setToolPolicy(entry.toolPolicy);
    setOutputContract(entry.outputContract);
    setModalTab('edit');
  };

  const latestRun = chatTurns.length > 0
    ? chatTurns[chatTurns.length - 1].run ?? referenceRun
    : referenceRun;
  const canJudge = !isLoading && !isRunning && latestRun.status === 'succeeded';

  return (
    <Card
      style={{ height: '100%' }}
      styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } }}
    >
      {/* ── Header ── */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <RobotOutlined style={{ color: '#52c41a', fontSize: 18 }} />
            <Title level={4} style={{ margin: 0 }}>Reference Agent</Title>
          </div>
          <Tag
            color={latestRun.status === 'succeeded' ? 'success' : latestRun.status === 'failed' ? 'error' : 'default'}
            style={{ margin: 0, textTransform: 'uppercase' }}
          >
            {latestRun.status}
          </Tag>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Select
            value={selectedMode}
            size="small"
            style={{ width: 130 }}
            onChange={setSelectedMode}
            options={[
              { value: 'no-llm', label: 'Deterministic' },
              { value: 'hybrid', label: 'Hybrid (LLM)' },
            ]}
          />

          <Tooltip title="사용할 LLM 모델 ID를 지정합니다. 비워두면 서버 기본값을 사용합니다.">
            <Input
              size="small"
              value={selectedModelId}
              onChange={e => setSelectedModelId(e.target.value)}
              placeholder="Model (기본값)"
              style={{ width: 160 }}
              allowClear
            />
          </Tooltip>

          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => setPromptModalOpen(true)}
          >
            Prompt edit
            {changedPromptOverrides() && <Tag color="blue" style={{ marginLeft: 5, fontSize: '0.68rem' }}>edited</Tag>}
          </Button>

          <div style={{ flex: 1 }} />

          <Space size={4} wrap>
            <Tooltip title={!canJudge ? '에이전트 실행 완료 후 사용 가능' : ''}>
              <Button size="small" type="primary" icon={<ExperimentOutlined />} onClick={onJudge} disabled={!canJudge}>
                Judge this trace
              </Button>
            </Tooltip>
            <Tooltip title={!canJudge ? '에이전트 실행 완료 후 사용 가능' : ''}>
              <Button size="small" icon={<FlagOutlined />} onClick={onSetBaseline} disabled={!canJudge}>
                Set baseline
              </Button>
            </Tooltip>
            <Tooltip title={!baselineRun ? 'Baseline을 먼저 설정하세요' : !canJudge ? '에이전트 실행 완료 후 사용 가능' : ''}>
              <Button size="small" icon={<BranchesOutlined />} onClick={onComparePromptRegression} disabled={!canJudge || !baselineRun}>
                Compare
              </Button>
            </Tooltip>
          </Space>
        </div>

        {baselineRun && (
          <div style={{ marginTop: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <FlagOutlined style={{ color: '#16a34a', fontSize: 11 }} />
            <Text style={{ fontSize: '0.72rem', color: '#15803d' }}>
              Baseline: <strong>{baselineRun.fixture || baselineRun.id}</strong>
            </Text>
          </div>
        )}
      </div>

      {/* ── Chat messages ── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 20, background: '#fafafa' }}>
        {chatTurns.length === 0 && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', color: '#94a3b8' }}>
              <RobotOutlined style={{ fontSize: 32, marginBottom: 12 }} />
              <div style={{ fontSize: '0.88rem' }}>아래 입력창에 분석 질의를 입력하거나,<br />예시(Examples) 드롭다운에서 선택하세요.</div>
            </div>
          </div>
        )}

        {chatTurns.map(turn => (
          <div key={turn.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* User bubble */}
            <div style={{ alignSelf: 'flex-end', maxWidth: '80%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end', marginBottom: 4 }}>
                <Text style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{turn.timestamp}</Text>
                <UserOutlined style={{ color: '#94a3b8', fontSize: 11 }} />
                <Text style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>USER</Text>
              </div>
              <div style={{ background: '#1677ff', color: '#fff', padding: '10px 14px', borderRadius: '12px', borderBottomRightRadius: 2, lineHeight: 1.55, fontSize: '0.88rem', whiteSpace: 'pre-wrap' }}>
                {turn.userMessage}
              </div>
            </div>

            {/* Agent bubble */}
            <AgentBubble turn={turn} />
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input area ── */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid #f0f0f0', background: '#fff', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <Select
            placeholder="Examples (fixture 질의 자동완성)"
            size="small"
            style={{ flex: 1 }}
            options={fixtures.map(f => ({ value: f.value, label: f.label }))}
            onChange={handleFixtureSelect}
            value={null}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <Input.TextArea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="분석 질의를 입력하세요… (Shift+Enter 줄바꿈, Enter 전송)"
            autoSize={{ minRows: 2, maxRows: 5 }}
            style={{ flex: 1, resize: 'none' }}
            disabled={isRunning}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleSend}
            loading={isRunning}
            disabled={!input.trim()}
            style={{ height: 'auto', alignSelf: 'stretch' }}
          >
            Send
          </Button>
        </div>
      </div>

      {/* ── Prompt edit modal ── */}
      <Modal
        title="Prompt edit for candidate run"
        open={promptModalOpen}
        onCancel={handleDone}
        footer={null}
        width={720}
        destroyOnHidden
      >
        <Tabs
          activeKey={modalTab}
          onChange={k => setModalTab(k as 'edit' | 'history')}
          items={[
            {
              key: 'edit',
              label: <span><EditOutlined /> Edit</span>,
              children: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <Text type="secondary" style={{ fontSize: '0.78rem' }}>
                    Baseline은 prompt edit을 비운 기본 prompt로 실행한 뒤 Set baseline 하세요. Candidate는 Load default prompts로 현재 prompt를 불러와 실제 문구를 수정한 뒤 실행합니다.
                  </Text>
                  <Space>
                    <Button size="small" onClick={loadDefaultPrompts} disabled={!defaultPrompts}>Load default prompts</Button>
                    <Button size="small" onClick={() => { setSystemPrompt(''); setToolPolicy(''); setOutputContract(''); }}>Clear edits</Button>
                  </Space>
                  <div>
                    <Text type="secondary" style={{ fontSize: '0.75rem', display: 'block', marginBottom: 4 }}>Prompt variant label</Text>
                    <Input value={promptVariant} onChange={e => setPromptVariant(e.target.value)} placeholder="prompt variant label" />
                  </div>
                  <div>
                    <Text type="secondary" style={{ fontSize: '0.75rem', display: 'block', marginBottom: 4 }}>System Prompt</Text>
                    <Input.TextArea rows={4} value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} placeholder="Override SYSTEM_PROMPT (optional)" />
                  </div>
                  <div>
                    <Text type="secondary" style={{ fontSize: '0.75rem', display: 'block', marginBottom: 4 }}>Tool Policy</Text>
                    <Input.TextArea rows={4} value={toolPolicy} onChange={e => setToolPolicy(e.target.value)} placeholder="Override TOOL_POLICY (optional)" />
                  </div>
                  <div>
                    <Text type="secondary" style={{ fontSize: '0.75rem', display: 'block', marginBottom: 4 }}>Output Contract</Text>
                    <Input.TextArea rows={5} value={outputContract} onChange={e => setOutputContract(e.target.value)} placeholder="Override OUTPUT_CONTRACT (optional)" />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button type="primary" onClick={handleDone}>Done</Button>
                  </div>
                </div>
              ),
            },
            {
              key: 'history',
              label: (
                <span>
                  <HistoryOutlined /> History
                  {history.length > 0 && <Tag style={{ marginLeft: 4, fontSize: '0.68rem' }}>{history.length}</Tag>}
                </span>
              ),
              children: (
                <div style={{ maxHeight: 480, overflowY: 'auto' }}>
                  <HistoryList history={history} onLoad={handleLoadHistory} onRemove={remove} onClear={clear} />
                </div>
              ),
            },
          ]}
        />
      </Modal>
    </Card>
  );
}
