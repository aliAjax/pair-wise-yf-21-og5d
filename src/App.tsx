import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import { buildSeedState } from "./seed";
import { confirmConflict, runReconciliation } from "./engine";
import type {
  AppState,
  DamageFrame,
  ReconcileEvent,
  ReturnRecord,
  ReturnStatus,
  Version,
  VersionSource,
} from "./types";

const STORAGE_KEY = "hxyfront-62009-reconcile";

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as AppState;
  } catch {
    // 存档损坏时回到演示数据
  }
  return buildSeedState();
}

const STATUS_META: Record<ReturnStatus, { label: string; cls: string }> = {
  pending: { label: "待处理", cls: "st-pending" },
  confirmed: { label: "已确认", cls: "st-confirmed" },
  conflict: { label: "两版待确认", cls: "st-conflict" },
  failed: { label: "对账失败", cls: "st-failed" },
  duplicate: { label: "已跳过重复", cls: "st-duplicate" },
};

const FRAME_STATUS_COLOR: Record<DamageFrame["status"], string> = {
  pending: "#94a3b8",
  confirmed: "#16a34a",
  conflict: "#d97706",
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function App() {
  const [state, setState] = useState<AppState>(loadState);
  const [failArmed, setFailArmed] = useState(false);
  const [selectedCarpet, setSelectedCarpet] = useState<string>(
    state.carpets[0]?.id ?? ""
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // 存储不可用时仅保存在内存
    }
  }, [state]);

  const pendingCount = state.returns.filter((r) => r.status === "pending").length;
  const conflictCount = state.frames.filter((f) => f.status === "conflict").length;
  const confirmedCount = state.frames.filter((f) => f.status === "confirmed").length;
  const totalDeducted = state.cards.reduce((sum, c) => sum + c.deducted, 0);

  const events = useMemo(() => state.events.slice(0, 30), [state.events]);

  function handleRun() {
    const outcome = runReconciliation(state.frames, state.cards, state.returns, {
      failInjected: failArmed,
    });
    setState((s) => ({
      ...s,
      frames: outcome.frames,
      cards: outcome.cards,
      returns: outcome.returns,
      events: [...outcome.events, ...s.events].slice(0, 60),
      session: outcome.failed ? "failed" : "done",
    }));
    setFailArmed(false);
  }

  function handleConfirm(frameId: string, source: VersionSource) {
    const outcome = confirmConflict(state.frames, state.cards, state.returns, frameId, source);
    if (outcome.events.length === 0) return;
    setState((s) => ({
      ...s,
      frames: outcome.frames,
      cards: outcome.cards,
      returns: outcome.returns,
      events: [...outcome.events, ...s.events].slice(0, 60),
    }));
  }

  function handleReset() {
    localStorage.removeItem(STORAGE_KEY);
    setState(buildSeedState());
    setFailArmed(false);
  }

  const failed = state.session === "failed";

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62009 · 回传对账</p>
        <h1>地毯修复回传对账工作台</h1>
        <span>
          清洗与补线回传后，按
          <strong>地毯编号 · 破损框 · 工序</strong>
          合并施工记录。两边都改过的同一处保留两版待确认，后到的不盖先到的；
          确认后才按实测用量扣一次色卡，重复回传不再扣第二遍。对账失败时留住已确认的地毯，恢复后只续做没对上的。
        </span>
      </section>

      <section className="metrics">
        <article>
          <small>待处理回传</small>
          <strong>{pendingCount}</strong>
        </article>
        <article>
          <small>两版待确认</small>
          <strong>{conflictCount}</strong>
        </article>
        <article>
          <small>已确认地毯</small>
          <strong>{confirmedCount}</strong>
        </article>
        <article>
          <small>色卡已扣用量（米）</small>
          <strong>{totalDeducted}</strong>
        </article>
      </section>

      <section className="panel reconcile-panel">
        <div className="heading">
          <div>
            <p>工坊回传</p>
            <h2>回传对账</h2>
          </div>
          <div className="controls">
            <label className="fail-toggle">
              <input
                type="checkbox"
                checked={failArmed}
                onChange={(e) => setFailArmed(e.target.checked)}
              />
              模拟对账失败
            </label>
            <button className="primary" onClick={handleRun} disabled={pendingCount === 0}>
              {failed ? "恢复对账（只续做没对上的）" : "开始对账"}
            </button>
            <button onClick={handleReset}>重置演示</button>
          </div>
        </div>

        {failed && (
          <div className="banner banner-fail">
            <strong>对账失败：</strong>
            已确认 {confirmedCount} 条地毯已留住（色卡已按实测用量扣减），剩余 {pendingCount} 条未对上保持待处理。
            点击「恢复对账」只续做没对上的记录，已确认的不会重跑、不会重复扣减。
          </div>
        )}

        <div className="returns">
          {state.returns.map((ret) => {
            const frame = state.frames.find(
              (f) => f.carpetId === ret.carpetId && f.id === ret.frameId
            );
            return (
              <ReturnRow
                key={ret.id}
                ret={ret}
                frame={frame}
                onConfirm={handleConfirm}
              />
            );
          })}
        </div>
      </section>

      <section className="workspace">
        <aside className="panel">
          <div className="heading">
            <div>
              <p>修复档案</p>
              <h2>纹样破损框</h2>
            </div>
          </div>
          <div className="chips">
            {state.carpets.map((c) => (
              <button
                key={c.id}
                className={c.id === selectedCarpet ? "active" : ""}
                onClick={() => setSelectedCarpet(c.id)}
              >
                {c.id} · {c.origin}
              </button>
            ))}
          </div>
          <CarpetMap
            carpetId={selectedCarpet}
            frames={state.frames.filter((f) => f.carpetId === selectedCarpet)}
          />
          <dl className="carpet-meta">
            {state.carpets
              .filter((c) => c.id === selectedCarpet)
              .map((c) => (
                <div key={c.id}>
                  <dt>年代 / 材质</dt>
                  <dd>
                    {c.era} · {c.material}
                  </dd>
                  <dt>结密度 / 染色</dt>
                  <dd>
                    {c.knotDensity} · {c.dyeType}
                  </dd>
                </div>
              ))}
          </dl>
        </aside>

        <section className="panel">
          <div className="heading">
            <div>
              <p>材料色卡</p>
              <h2>补线色卡（按实测用量扣减）</h2>
            </div>
          </div>
          <div className="cards-grid">
            {state.cards.map((c) => {
              const used = c.deducted;
              const total = c.stock + used;
              const pct = total > 0 ? Math.round((used / total) * 100) : 0;
              return (
                <article key={c.code} className="color-card">
                  <div className="swatch" style={{ background: c.color }} />
                  <div className="color-info">
                    <h3>
                      {c.name} <span>{c.code}</span>
                    </h3>
                    <p>
                      库存 {c.stock}
                      {c.unit} · 已扣 {used}
                      {c.unit}
                    </p>
                    <div className="stock-bar">
                      <i style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="heading" style={{ marginTop: 22 }}>
            <div>
              <p>对账流水</p>
              <h2>操作记录</h2>
            </div>
          </div>
          <ul className="event-log">
            {events.length === 0 && <li className="event-empty">暂无对账记录</li>}
            {events.map((e) => (
              <li key={e.id} className={`event-${e.kind}`}>
                <span className="event-time">{formatTime(e.time)}</span>
                {e.message}
              </li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  );
}

function ReturnRow({
  ret,
  frame,
  onConfirm,
}: {
  ret: ReturnRecord;
  frame?: DamageFrame;
  onConfirm: (frameId: string, source: VersionSource) => void;
}) {
  const meta = STATUS_META[ret.status];
  return (
    <article className={`return-row status-${ret.status}`}>
      <header>
        <strong>{ret.id}</strong>
        <span className={`badge ${meta.cls}`}>{meta.label}</span>
      </header>
      <p className="ret-target">
        {ret.carpetId} · {ret.frameId} · {ret.process}
      </p>
      <p className="ret-desc">{ret.description}</p>
      <p className="ret-usage">
        实测用量：
        <b>
          {ret.threadColor} {ret.measuredUsage} 米
        </b>
      </p>
      {ret.status === "failed" && <p className="ret-error">⚠ {ret.error}</p>}

      {ret.status === "conflict" && frame && (
        <div className="conflict-box">
          <p className="conflict-hint">
            同一处两边都做过修改，保留两版待确认，后到的没有覆盖先到的。确认后才按实测用量扣一次色卡。
          </p>
          <div className="conflict-grid">
            <VersionCard title="总店版" version={frame.hq} />
            <VersionCard title="工坊版" version={frame.workshop} />
          </div>
          <div className="conflict-actions">
            <button onClick={() => onConfirm(frame.id, "hq")}>采用总店版</button>
            <button className="primary" onClick={() => onConfirm(frame.id, "workshop")}>
              采用工坊版
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

function VersionCard({ title, version }: { title: string; version?: Version }) {
  if (!version) return null;
  return (
    <div className="version-card">
      <h4>{title}</h4>
      <p>{version.description}</p>
      <p>
        色卡 <b>{version.threadColor}</b> · 实测用量 <b>{version.measuredUsage} 米</b>
      </p>
      <time>{formatTime(version.updatedAt)}</time>
    </div>
  );
}

function CarpetMap({ carpetId, frames }: { carpetId: string; frames: DamageFrame[] }) {
  return (
    <svg viewBox="0 0 100 130" className="carpet-map" role="img" aria-label={`${carpetId} 纹样破损框`}>
      <rect x="2" y="2" width="96" height="126" rx="6" fill="#f3ece2" stroke="#7c2d12" strokeWidth="1.5" />
      <rect x="8" y="8" width="84" height="114" rx="4" fill="none" stroke="#b45309" strokeWidth="0.7" />
      <rect x="14" y="14" width="72" height="102" rx="3" fill="none" stroke="#0f766e" strokeWidth="0.5" strokeDasharray="2 2" />
      <ellipse cx="50" cy="65" rx="22" ry="30" fill="#e7d9c4" stroke="#0f766e" strokeWidth="1" />
      <ellipse cx="50" cy="65" rx="12" ry="16" fill="none" stroke="#0f766e" strokeWidth="0.6" />
      <path d="M50 35 L54 50 L50 47 L46 50 Z" fill="#b45309" opacity="0.6" />
      <path d="M50 95 L54 80 L50 83 L46 80 Z" fill="#b45309" opacity="0.6" />
      {frames.map((m, i) => (
        <g key={m.id}>
          <circle
            cx={m.x}
            cy={m.y}
            r="4.6"
            fill={FRAME_STATUS_COLOR[m.status]}
            stroke="#ffffff"
            strokeWidth="1.2"
          />
          <text
            x={m.x}
            y={m.y + 1.4}
            textAnchor="middle"
            fontSize="4.2"
            fill="#ffffff"
            fontWeight="700"
          >
            {i + 1}
          </text>
        </g>
      ))}
    </svg>
  );
}
