import { useState, useEffect, useCallback } from 'react';
import { Select, Tag, Button, Tooltip, Space, Typography, Input, Empty, Spin } from 'antd';
import { ReloadOutlined, ExperimentOutlined, FlagOutlined } from '@ant-design/icons';
import type { ReferenceRun } from '../types/judge';
import * as api from '../api/judgeClient';

const { Text } = Typography;

type RunRecord = {
  id: string;
  fixtureId?: string;
  userInput?: string;
  modelId?: string;
  status: string;
  promptVariant?: string;
  eventCounts: Record<string, number>;
  createdAt: number;
};

type Props = {
  onJudge: (run: ReferenceRun) => void;
  onSetBaseline: (run: ReferenceRun) => void;
  currentBaselineId?: string;
};

function statusColor(s: string) {
  if (s === 'succeeded') return 'success';
  if (s === 'failed') return 'error';
  return 'default';
}

function formatTs(ts: number) {
  return new Date(ts * 1000).toLocaleString([], {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function toReferenceRun(r: RunRecord): ReferenceRun {
  return {
    id: r.id,
    fixture: r.fixtureId,
    mode: 'custom-analysis',
    status: r.status as ReferenceRun['status'],
    userInput: r.userInput,
    modelId: r.modelId,
    promptVariant: r.promptVariant,
    eventCounts: r.eventCounts || {},
    timeline: [],
  };
}

export function RunHistoryPanel({ onJudge, onSetBaseline, currentBaselineId }: Props) {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterFixture, setFilterFixture] = useState<string>('');
  const [filterModel, setFilterModel] = useState<string>('');
  const [fixtures, setFixtures] = useState<{ value: string; label: string }[]>([]);

  const loadRuns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getRuns({
        status: filterStatus || undefined,
        fixture: filterFixture || undefined,
        modelId: filterModel || undefined,
        limit: 50,
      });
      setRuns(res.runs || []);
      setTotal(res.total ?? (res.runs || []).length);
    } catch {
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterFixture, filterModel]);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  useEffect(() => {
    api.getFixtures()
      .then(list => setFixtures(list.map((f: any) => ({ value: f.id, label: f.id }))))
      .catch(() => {});
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* 필터 바 */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Select
          size="small"
          placeholder="상태"
          value={filterStatus || undefined}
          onChange={v => setFilterStatus(v ?? '')}
          allowClear
          style={{ width: 110 }}
          options={[
            { value: 'succeeded', label: '✅ Succeeded' },
            { value: 'failed',    label: '❌ Failed' },
          ]}
        />
        <Select
          size="small"
          placeholder="Fixture"
          value={filterFixture || undefined}
          onChange={v => setFilterFixture(v ?? '')}
          allowClear
          style={{ width: 180 }}
          options={fixtures}
        />
        <Input
          size="small"
          placeholder="Model ID"
          value={filterModel}
          onChange={e => setFilterModel(e.target.value)}
          allowClear
          style={{ width: 140 }}
        />
        <Tooltip title="새로고침">
          <Button size="small" icon={<ReloadOutlined />} onClick={loadRuns} loading={loading} />
        </Tooltip>
        <Text type="secondary" style={{ fontSize: '0.72rem', marginLeft: 'auto' }}>
          {total}개 중 {runs.length}개 표시
        </Text>
      </div>

      {/* 목록 */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {loading && runs.length === 0 ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin /></div>
        ) : runs.length === 0 ? (
          <Empty description="실행 기록이 없습니다" style={{ padding: 40 }} />
        ) : (
          runs.map(run => (
            <div
              key={run.id}
              style={{ padding: '10px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', gap: 10, alignItems: 'flex-start' }}
            >
              {/* 왼쪽: 상태 + 정보 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
                  <Tag color={statusColor(run.status)} style={{ margin: 0, fontSize: '0.65rem', textTransform: 'uppercase' }}>
                    {run.status}
                  </Tag>
                  {run.modelId && (
                    <Tag color="purple" style={{ margin: 0, fontSize: '0.65rem' }}>{run.modelId}</Tag>
                  )}
                  {run.fixtureId && (
                    <Tag style={{ margin: 0, fontSize: '0.65rem' }}>{run.fixtureId}</Tag>
                  )}
                  {run.id === currentBaselineId && (
                    <Tag color="green" style={{ margin: 0, fontSize: '0.65rem' }}>BASELINE</Tag>
                  )}
                </div>

                {run.userInput && (
                  <Text style={{ fontSize: '0.78rem', display: 'block', color: '#334155', marginBottom: 2 }}
                    ellipsis={{ tooltip: run.userInput }}>
                    {run.userInput}
                  </Text>
                )}

                <Text style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                  {formatTs(run.createdAt)}
                  {run.eventCounts && Object.keys(run.eventCounts).length > 0 && (
                    <span style={{ marginLeft: 8 }}>
                      {Object.entries(run.eventCounts).slice(0, 3).map(([k, v]) => `${k}:${v}`).join(' · ')}
                    </span>
                  )}
                </Text>
              </div>

              {/* 오른쪽: 액션 버튼 */}
              <Space size={4} style={{ flexShrink: 0 }}>
                <Tooltip title="이 run을 Judge">
                  <Button
                    size="small"
                    type="primary"
                    icon={<ExperimentOutlined />}
                    disabled={run.status !== 'succeeded'}
                    onClick={() => onJudge(toReferenceRun(run))}
                  />
                </Tooltip>
                <Tooltip title="이 run을 Baseline으로 설정">
                  <Button
                    size="small"
                    icon={<FlagOutlined />}
                    disabled={run.status !== 'succeeded'}
                    onClick={() => onSetBaseline(toReferenceRun(run))}
                  />
                </Tooltip>
              </Space>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
