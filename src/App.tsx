import { useEffect, useMemo, useState } from "react";
import type { ItemStatus, ReconItem, ReconState, Source } from "./recon/types";
import {
  confirmItem,
  countByStatus,
  ingestBatch,
  resumeAutoRecon,
  restock,
  runAutoRecon,
} from "./recon/engine";
import { allBatches } from "./recon/seed";
import { bootstrap, clearSaved, loadState, saveState } from "./recon/store";
import "./styles.css";

const STATUS_META: Record<ItemStatus, { label: string; cls: string }> = {
  single: { label: "单方待核", cls: "st-single" },
  matched: { label: "一致待确认", cls: "st-matched" },
  conflict: { label: "两版待确认", cls: "st-conflict" },
  confirmed: { label: "已确认扣线", cls: "st-confirmed" },
  orphan: { label: "底账对不上", cls: "st-orphan" },
};

const FILTERS: { key: ItemStatus | "all"; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "matched", label: "一致待确认" },
  { key: "conflict", label: "两版待确认" },
  { key: "single", label: "单方待核" },
  { key: "confirmed", label: "已确认" },
  { key: "orphan", label: "孤儿" },
];

function Version({
  item,
  side,
  state,
  onConfirm,
}: {
  item: ReconItem;
  side: Source;
  state: ReconState;
  onConfirm: (key: string, side: Source) => void;
}) {
  const recs = side === "archive" ? item.archive : item.workshop;
  const title = side === "archive" ? "总店修复档案" : "合作工坊回传";
  const latest = recs[recs.length - 1];
  const card = latest?.colorCardId ? state.cards[latest.colorCardId] : undefined;
  const chosen = item.confirmed?.source === side;
  return (
    <div className={`ver ${side} ${chosen ? "chosen" : ""}`}>
      <div className="ver-head">
        <span className="ver-title">{title}</span>
        {recs.length > 1 && <span className="multi">留档 {recs.length} 版</span>}
        {chosen && <span className="picked">✔ 采用此版结算</span>}
      </div>
      {recs.length === 0 ? (
        <p className="empty-ver">尚无记录</p>
      ) : (
        <>
          {recs.map((r, idx) => (
            <div key={r.recordId} className={`rec ${idx === recs.length - 1 ? "" : "old"}`}>
              <div className="rec-line">
                <b>{r.recordId}</b>
                {idx < recs.length - 1 && <em>先到·已留档</em>}
                {r.returnId && <span className="rt">回执 {r.returnId}</span>}
                <time>{r.at}</time>
              </div>
              <p className="rec-note">
                {r.editor} · {r.note ?? "—"}
              </p>
              {r.process === "补线" && r.usageMeters !== undefined && (
                <p className="rec-use">
                  实测用量 <b>{r.usageMeters}m</b>
                  {card && (
                    <span className="swatch-wrap">
                      <i className="swatch" style={{ background: card.hex }} />
                      {card.name}（{card.id}）
                    </span>
                  )}
                </p>
              )}
            </div>
          ))}
          {item.status !== "confirmed" && latest && (
            <button className="mini" onClick={() => onConfirm(item.key, side)}>
              采用{side === "archive" ? "档案" : "工坊实测"}版确认扣线
            </button>
          )}
        </>
      )}
    </div>
  );
}

function ItemCard({
  item,
  state,
  onConfirm,
}: {
  item: ReconItem;
  state: ReconState;
  onConfirm: (key: string, side: Source) => void;
}) {
  const carpet = state.carpets[item.carpetNo];
  const frame = carpet?.frames.find((f) => f.id === item.frameId);
  const meta = STATUS_META[item.status];
  return (
    <article className={`item ${meta.cls}`}>
      <header className="item-head">
        <div>
          <h3>
            {item.carpetNo} · 破损框 {item.frameId}
            {frame && <em className="part">（{frame.part}：{frame.damage}）</em>}
          </h3>
          <p className="proc">
            工序：<b>{item.process}</b>
            {carpet && <span>　{carpet.origin} · {carpet.era} · {carpet.material}</span>}
          </p>
        </div>
        <span className={`badge ${meta.cls}`}>{meta.label}</span>
      </header>

      <div className="vers">
        <Version item={item} side="archive" state={state} onConfirm={onConfirm} />
        <div className="vs" />
        <Version item={item} side="workshop" state={state} onConfirm={onConfirm} />
      </div>

      {item.status === "conflict" && (
        <p className="hint warn-hint">
          同一处两边都改过：两版均已留档，后到记录未覆盖先到记录。请核对后选择一版确认。
        </p>
      )}
      {item.lastError && <p className="hint err-hint">⚠ {item.lastError}</p>}
      {item.status === "confirmed" && item.confirmed && (
        <p className="hint ok-hint">
          已于 {item.confirmed.at} 确认（{item.confirmed.runId}），扣减台账已记账，重复回传不会再扣。
        </p>
      )}
    </article>
  );
}

function App() {
  const [state, setState] = useState<ReconState>(loadState);
  const [filter, setFilter] = useState<ItemStatus | "all">("all");
  const [injectFault, setInjectFault] = useState(true);

  useEffect(() => saveState(state), [state]);

  const counts = useMemo(() => countByStatus(state), [state]);
  const items = useMemo(() => {
    const list = Object.values(state.items);
    return list
      .filter((i) => filter === "all" || i.status === filter)
      .sort((a, b) => a.key.localeCompare(b.key));
  }, [state, filter]);

  const usedMeters = state.ledger.reduce((s, e) => s + e.meters, 0);
  const cp = state.checkpoint;

  const actions = {
    ingest(id: string) {
      const batch = allBatches.find((b) => b.id === id);
      if (batch) setState((s) => ingestBatch(s, batch));
    },
    run() {
      setState((s) => runAutoRecon(s, injectFault ? { failAfter: 2 } : {}).state);
    },
    resume() {
      setState((s) => resumeAutoRecon(s).state);
    },
    confirm(key: string, side: Source) {
      setState((s) => confirmItem(s, key, side));
    },
    restock(id: string, m: number) {
      setState((s) => restock(s, id, m));
    },
    reset() {
      clearSaved();
      setState(bootstrap());
    },
  };

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62009 · 总店 ↔ 合作工坊 · Port 62009</p>
        <h1>修复回传对账工作台</h1>
        <span>
          修复档案 × 破损框 × 补线色卡三本底账，按「地毯编号 + 破损框 + 工序」合并工坊施工记录；
          两边都改过就两版留档待人工确认，后到不盖先到；确认后按实测用量只扣一次色卡，
          重复回传不扣第二遍；对账中断保留已确认地毯，恢复后只续做没对上的。
        </span>
      </section>

      <section className="metrics">
        <article>
          <small>一致待确认</small>
          <strong>{counts.matched}</strong>
        </article>
        <article>
          <small>两版待确认</small>
          <strong>{counts.conflict}</strong>
        </article>
        <article>
          <small>已确认（处）</small>
          <strong>{counts.confirmed}</strong>
        </article>
        <article>
          <small>色卡已扣 / 拦截重复</small>
          <strong>
            {Math.round(usedMeters * 10) / 10}m · {state.dupes.length}
          </strong>
        </article>
      </section>

      {cp?.interrupted && (
        <div className="checkpoint">
          <div>
            <b>对账中断（{cp.runId}）</b>
            <span>
              {cp.at} 失败 · 已确认 {cp.confirmedCarpets.join("、") || "—"} 等地毯的成果已保留，
              尚有 {cp.remaining} 项未对上
            </span>
          </div>
          <button className="primary" onClick={actions.resume}>
            恢复：只续做没对上的
          </button>
        </div>
      )}

      <section className="workspace">
        <aside className="panel side-panel">
          <h2>回传批次</h2>
          <div className="batches">
            {allBatches.map((b) => {
              const done = state.ingestedBatches.includes(b.id);
              return (
                <div key={b.id} className={`batch ${done ? "done" : ""}`}>
                  <div>
                    <b>{b.title}</b>
                    <span>{b.id} · {b.at}</span>
                    <small>{b.records.length} 条施工记录</small>
                  </div>
                  <button disabled={done} onClick={() => actions.ingest(b.id)}>
                    {done ? "已接收" : "接收回传"}
                  </button>
                </div>
              );
            })}
          </div>

          <h2 className="mt">自动对账</h2>
          <label className="switch">
            <input
              type="checkbox"
              checked={injectFault}
              onChange={(e) => setInjectFault(e.target.checked)}
            />
            <span>演练：确认 2 项后注入故障中断</span>
          </label>
          <div className="btn-row">
            <button className="primary" onClick={actions.run}>
              {cp?.interrupted ? "重新跑全量" : "开始自动对账"}
            </button>
            <button onClick={actions.reset}>重置演示数据</button>
          </div>
          <p className="tip">自动对账只处理「两边一致」项，冲突项与孤儿项一律留给人工。</p>

          <h2 className="mt">补线色卡</h2>
          <div className="cards">
            {Object.values(state.cards).map((c) => (
              <div key={c.id} className="card">
                <i className="swatch big" style={{ background: c.hex }} />
                <div className="card-info">
                  <b>{c.name}</b>
                  <span>{c.id} · 库存 {c.stockMeters}m</span>
                </div>
                <button className="mini" onClick={() => actions.restock(c.id, 5)}>
                  +5m
                </button>
              </div>
            ))}
          </div>
        </aside>

        <section className="panel main-panel">
          <div className="heading">
            <div>
              <p>合并视图：地毯编号 + 破损框 + 工序</p>
              <h2>对账明细</h2>
            </div>
          </div>
          <div className="chips filter-chips">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                className={filter === f.key ? "chip-on" : ""}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
                {f.key !== "all" && <em> {counts[f.key]}</em>}
              </button>
            ))}
          </div>

          <div className="items">
            {items.length === 0 && <p className="empty-ver">当前筛选下暂无对账项</p>}
            {items.map((item) => (
              <ItemCard
                key={item.key}
                item={item}
                state={state}
                onConfirm={actions.confirm}
              />
            ))}
          </div>
        </section>
      </section>

      <section className="dual">
        <div className="panel">
          <h2>色卡扣减台账（每处仅一笔）</h2>
          {state.ledger.length === 0 ? (
            <p className="empty-ver">尚无扣减记录</p>
          ) : (
            <table className="ledger">
              <thead>
                <tr>
                  <th>地毯/破损框/工序</th>
                  <th>色卡</th>
                  <th>实测用量</th>
                  <th>依据回执</th>
                  <th>确认批次</th>
                  <th>时间</th>
                </tr>
              </thead>
              <tbody>
                {state.ledger.map((e) => (
                  <tr key={e.key}>
                    <td>{e.carpetNo} / {e.frameId} / {e.process}</td>
                    <td>{state.cards[e.colorCardId]?.name ?? e.colorCardId}</td>
                    <td>{e.meters}m</td>
                    <td>{e.recordId}{e.returnId ? `（${e.returnId}）` : ""}</td>
                    <td>{e.runId}</td>
                    <td>{e.at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="panel">
          <h2>重复回传拦截</h2>
          {state.dupes.length === 0 ? (
            <p className="empty-ver">暂无重复回传</p>
          ) : (
            <ul className="dupes">
              {state.dupes.map((d) => (
                <li key={d.recordId}>
                  <b>{d.returnId}</b>
                  <span>
                    第二批记录 {d.recordId}（{d.at}）与首发回执同号，已拦下：
                    不覆盖留档、不重复扣线
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="panel log-panel">
        <h2>操作与对账流水</h2>
        <div className="log">
          {[...state.log].reverse().map((l) => (
            <p key={l.seq} className={`logline lvl-${l.level}`}>
              <time>{l.at}</time>
              <span>{l.msg}</span>
            </p>
          ))}
        </div>
      </section>
    </main>
  );
}

export default App;
