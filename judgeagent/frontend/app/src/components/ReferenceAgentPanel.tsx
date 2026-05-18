import { useState } from 'react';
import type { PromptOverrides, ReferencePromptDefaults, ReferenceRun } from '../types/judge';
import { ReferenceChatView } from './ReferenceChatView';
import { Card, Select, Button, Space, Typography, Tag, Divider, Row, Col, Modal, Input, Tabs, Tooltip, Popconfirm, Empty } from 'antd';
import { PlayCircleOutlined, ExperimentOutlined, BranchesOutlined, FlagOutlined, EditOutlined, DeleteOutlined, HistoryOutlined, RollbackOutlined } from '@ant-design/icons';
import { usePromptHistory } from '../hooks/usePromptHistory';
import type { PromptHistoryEntry } from '../hooks/usePromptHistory';

const { Title, Text } = Typography;

type ReferenceAgentPanelProps = {
  referenceRun: ReferenceRun;
  onRun: (fixtureId: string, useLlm: boolean, promptOverrides?: PromptOverrides) => void;
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

export function ReferenceAgentPanel({ referenceRun, onRun, onJudge, onSetBaseline, onComparePromptRegression, baselineRun, defaultPrompts, isLoading }: ReferenceAgentPanelProps) {
  const [selectedFixture, setSelectedFixture] = useState(referenceRun.fixture || 'normal-login-error-spike');
  const [selectedMode, setSelectedMode] = useState('hybrid');
  const [promptVariant, setPromptVariant] = useState('candidate-edit');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [toolPolicy, setToolPolicy] = useState('');
  const [outputContract, setOutputContract] = useState('');
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<'edit' | 'history'>('edit');
  const { history, save, remove, clear } = usePromptHistory();

  const loadDefaultPrompts = () => {
    if (!defaultPrompts) return;
    setSystemPrompt(defaultPrompts.system);
    setToolPolicy(defaultPrompts.tool_policy);
    setOutputContract(defaultPrompts.output_contract);
  };

  const clearPromptEdits = () => {
    setSystemPrompt('');
    setToolPolicy('');
    setOutputContract('');
  };

  const changedPromptOverrides = (): PromptOverrides | undefined => {
    const promptOverrides: PromptOverrides = { variant: promptVariant || 'candidate-edit' };
    if (systemPrompt.trim() && systemPrompt !== defaultPrompts?.system) promptOverrides.system = systemPrompt;
    if (toolPolicy.trim() && toolPolicy !== defaultPrompts?.tool_policy) promptOverrides.tool_policy = toolPolicy;
    if (outputContract.trim() && outputContract !== defaultPrompts?.output_contract) promptOverrides.output_contract = outputContract;
    return Object.keys(promptOverrides).length > 1 ? promptOverrides : undefined;
  };

  const handleDone = () => {
    const hasEdit = systemPrompt.trim() || toolPolicy.trim() || outputContract.trim();
    if (hasEdit) {
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

  const handleRun = () => {
    onRun(selectedFixture, selectedMode === 'hybrid', changedPromptOverrides());
  };

  return (
    <Card bordered={false} style={{ height: '100%' }} styles={{ body: { padding: '24px', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, boxSizing: 'border-box' } }}>
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={4} style={{ margin: 0 }}>Reference Agent Controls</Title>
        <Tag color={referenceRun.status === 'succeeded' ? 'success' : referenceRun.status === 'failed' ? 'error' : 'default'} style={{ margin: 0, textTransform: 'uppercase' }}>
          {referenceRun.status}
        </Tag>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
        <Col span={24}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Row gutter={16}>
              <Col span={14}>
                <Text type="secondary" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }}>Fixture</Text>
                <Select
                  defaultValue={selectedFixture}
                  style={{ width: '100%' }}
                  onChange={(val) => setSelectedFixture(val)}
                  options={[
                    { value: 'normal-login-error-spike', label: 'normal-login-error-spike' },
                    { value: 'drift-prompt-output-contract', label: 'drift-prompt-output-contract' },
                    { value: 'drift-wrong-endpoint', label: 'drift-wrong-endpoint' },
                    { value: 'drift-parse-error-ignored', label: 'drift-parse-error-ignored' },
                    { value: 'drift-validation-skipped', label: 'drift-validation-skipped' },
                    { value: 'drift-metric-hallucination', label: 'drift-metric-hallucination' }
                  ]}
                />
              </Col>
              <Col span={10}>
                <Text type="secondary" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }}>Mode</Text>
                <Select
                  defaultValue={selectedMode}
                  style={{ width: '100%' }}
                  onChange={(val) => setSelectedMode(val)}
                  options={[
                    { value: 'no-llm', label: 'Deterministic' },
                    { value: 'hybrid', label: 'Hybrid (LLM)' }
                  ]}
                />
              </Col>
            </Row>

            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => setPromptModalOpen(true)}
              style={{ marginTop: 8, alignSelf: 'flex-start' }}
            >
              Prompt edit for candidate run
              {changedPromptOverrides() && <Tag color="blue" style={{ marginLeft: 6, fontSize: '0.7rem' }}>edited</Tag>}
            </Button>

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
                onChange={(k) => setModalTab(k as 'edit' | 'history')}
                items={[
                  {
                    key: 'edit',
                    label: <span><EditOutlined /> Edit</span>,
                    children: (
                      <Space direction="vertical" style={{ width: '100%' }} size="middle">
                        <Text type="secondary" style={{ fontSize: '0.78rem' }}>Baseline은 prompt edit을 비운 기본 prompt로 실행한 뒤 Set baseline 하세요. Candidate는 Load default prompts로 현재 prompt를 불러와 실제 문구를 수정한 뒤 실행합니다.</Text>
                        <Space>
                          <Button size="small" onClick={loadDefaultPrompts} disabled={!defaultPrompts}>Load default prompts</Button>
                          <Button size="small" onClick={clearPromptEdits}>Clear edits / run default prompt</Button>
                        </Space>
                        <div>
                          <Text type="secondary" style={{ fontSize: '0.75rem', display: 'block', marginBottom: 4 }}>Prompt variant label</Text>
                          <Input value={promptVariant} onChange={(e) => setPromptVariant(e.target.value)} placeholder="prompt variant label" />
                        </div>
                        <div>
                          <Text type="secondary" style={{ fontSize: '0.75rem', display: 'block', marginBottom: 4 }}>System Prompt</Text>
                          <Input.TextArea rows={4} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} placeholder="Override SYSTEM_PROMPT for candidate run (optional)" />
                        </div>
                        <div>
                          <Text type="secondary" style={{ fontSize: '0.75rem', display: 'block', marginBottom: 4 }}>Tool Policy</Text>
                          <Input.TextArea rows={4} value={toolPolicy} onChange={(e) => setToolPolicy(e.target.value)} placeholder="Override TOOL_POLICY for candidate run (optional)" />
                        </div>
                        <div>
                          <Text type="secondary" style={{ fontSize: '0.75rem', display: 'block', marginBottom: 4 }}>Output Contract</Text>
                          <Input.TextArea rows={5} value={outputContract} onChange={(e) => setOutputContract(e.target.value)} placeholder="Override OUTPUT_CONTRACT for candidate run (optional)" />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <Button type="primary" onClick={handleDone}>Done</Button>
                        </div>
                      </Space>
                    ),
                  },
                  {
                    key: 'history',
                    label: <span><HistoryOutlined /> History {history.length > 0 && <Tag style={{ marginLeft: 4, fontSize: '0.68rem' }}>{history.length}</Tag>}</span>,
                    children: (
                      <div style={{ maxHeight: 480, overflowY: 'auto' }}>
                        <HistoryList
                          history={history}
                          onLoad={handleLoadHistory}
                          onRemove={remove}
                          onClear={clear}
                        />
                      </div>
                    ),
                  },
                ]}
              />
            </Modal>
            <Space style={{ marginTop: '8px' }}>
              <Button type="default" icon={<PlayCircleOutlined />} onClick={handleRun} loading={isLoading}>
                Run Reference Agent
              </Button>
              <Button type="primary" icon={<ExperimentOutlined />} onClick={onJudge} disabled={isLoading || referenceRun.status !== 'succeeded'}>
                Judge this trace
              </Button>
              <Button icon={<FlagOutlined />} onClick={onSetBaseline} disabled={isLoading || referenceRun.status !== 'succeeded'}>
                Set baseline
              </Button>
              <Button icon={<BranchesOutlined />} onClick={onComparePromptRegression} disabled={isLoading || referenceRun.status !== 'succeeded' || !baselineRun}>
                Compare prompt regression
              </Button>
            </Space>
          </Space>
        </Col>
      </Row>

      {referenceRun.promptVariant && referenceRun.promptVariant !== 'default' && (
        <div style={{ marginBottom: '16px' }}>
          <Tag color="blue">Prompt variant: {referenceRun.promptVariant}</Tag>
          {referenceRun.promptOverrides?.map((key) => <Tag key={key}>{key}</Tag>)}
        </div>
      )}

      {baselineRun && (
        <div style={{ marginBottom: '16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px' }}>
          <Text type="secondary" style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>Prompt regression baseline</Text>
          <Text strong style={{ fontSize: '0.85rem' }}>{baselineRun.fixture || baselineRun.id}</Text>
          <Text type="secondary" style={{ fontSize: '0.75rem', display: 'block' }}>{baselineRun.id}</Text>
        </div>
      )}

      {Object.keys(referenceRun.eventCounts).length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <Text type="secondary" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '8px' }}>Event counts</Text>
          <Space size={[8, 8]} wrap>
            {Object.entries(referenceRun.eventCounts).map(([key, value]) => (
              <Tag key={key} color="default" bordered={false} style={{ margin: 0 }}>
                {key} <strong style={{ marginLeft: '4px' }}>{value}</strong>
              </Tag>
            ))}
          </Space>
        </div>
      )}

      <Divider style={{ margin: '16px 0 0 0' }} />

      <div style={{ flexGrow: 1, minHeight: 0, overflowY: 'auto', paddingTop: '16px' }}>
        <ReferenceChatView run={referenceRun} />
      </div>
    </Card>
  );
}
