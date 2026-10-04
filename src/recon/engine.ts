import type {
  ColorCard,
  Confirmation,
  DupeArrival,
  ItemStatus,
  LogEntry,
  LogLevel,
  ReconItem,
  ReconState,
  ReturnBatch,
  SrcRecord,
  Source,
} from "./types";

/** 合并键：地毯编号 + 破损框 + 工序 */
export function keyOf(
  carpetNo: string,
  frameId: string,
  process: string
): string {
  return `${carpetNo}#${frameId}#${process}`;
}

export function splitKey(key: string): {
  carpetNo: string;
  frameId: string;
  process: ReconItem["process"];
} {
  const [carpetNo, frameId, process] = key.split("#");
  return { carpetNo, frameId, process: process as ReconItem["process"] };
}

export function log(
  state: ReconState,
  level: LogLevel,
  msg: string
): ReconState {
  const entry: LogEntry = {
    seq: state.logSeq + 1,
    at: nowStamp(),
    level,
    msg,
  };
  return { ...state, logSeq: entry.seq, log: [...state.log, entry] };
}

/** 可注入时钟，默认本机时间；保证引擎其余部分仍是纯函数 */
let clock: () => string = () =>
  new Date().toLocaleString("zh-CN", { hour12: false });

export function setClock(fn: () => string) {
  clock = fn;
}
export function nowStamp() {
  return clock();
}

/**
 * 业务签名：
 *  - 补线等耗材工序只对账「用量 + 色卡」，备注措辞差异不算冲突；
 *  - 清洗/固色无实测用量，以备注内容对账。
 * 两边一致才算对上。
 */
function signature(r: SrcRecord): string {
  if (r.usageMeters !== undefined || r.colorCardId) {
    return `${r.process}|m=${r.usageMeters ?? ""}|c=${r.colorCardId ?? ""}`;
  }
  return `${r.process}|n=${(r.note ?? "").trim()}`;
}

function getOrCreateItem(
  state: ReconState,
  rec: SrcRecord
): ReconItem {
  const key = keyOf(rec.carpetNo, rec.frameId, rec.process);
  return (
    state.items[key] ?? {
      key,
      carpetNo: rec.carpetNo,
      frameId: rec.frameId,
      process: rec.process,
      archive: [],
      workshop: [],
      status: "single",
    }
  );
}

function frameExists(state: ReconState, rec: SrcRecord): boolean {
  const carpet = state.carpets[rec.carpetNo];
  return Boolean(carpet?.frames.some((f) => f.id === rec.frameId));
}

/** 依据两边留档重算状态；已确认项永不被冲回 */
function recompute(item: ReconItem): ReconItem {
  if (item.status === "confirmed") return item;
  const hasA = item.archive.length > 0;
  const hasW = item.workshop.length > 0;
  let status: ItemStatus;
  if (hasA && hasW) {
    const latestA = item.archive[item.archive.length - 1];
    const latestW = item.workshop[item.workshop.length - 1];
    status = signature(latestA) === signature(latestW) ? "matched" : "conflict";
  } else {
    status = "single";
  }
  return { ...item, status, lastError: undefined };
}

/**
 * 接收一批工坊回传（也可用于灌入档案记录）。
 * 规则：
 *  - 同工坊回执号再次到达 → 重复回传，只登记、不覆盖、不扣减
 *  - 后到的版本追加留档，绝不覆盖先到的
 *  - 底账查无地毯/破损框 → 挂孤儿，等总店补档
 *  - 已确认处的新回传仅留档，不重开对账、不二次扣线
 */
export function ingestBatch(
  prev: ReconState,
  batch: ReturnBatch
): ReconState {
  if (prev.ingestedBatches.includes(batch.id)) {
    return log(prev, "warn", `批次 ${batch.id} 已接收，整批跳过防止重复入账`);
  }
  let state = log(prev, "info", `开始接收「${batch.title}」，共 ${batch.records.length} 条`);
  state = { ...state, items: { ...state.items } };

  for (const rec of batch.records) {
    const key = keyOf(rec.carpetNo, rec.frameId, rec.process);

    // 1) 重复回传：同 returnId 已见过
    if (rec.returnId && state.seenReturnIds[rec.returnId]) {
      const first = state.seenReturnIds[rec.returnId];
      const dupe: DupeArrival = {
        recordId: rec.recordId,
        returnId: rec.returnId,
        key,
        batchId: batch.id,
        at: rec.at,
      };
      state = {
        ...state,
        dupes: [...state.dupes, dupe],
      };
      state = log(
        state,
        "warn",
        `拦下重复回传 ${rec.returnId}（${rec.carpetNo}/${rec.frameId}/${rec.process}，首发 ${first.at}）：不覆盖先到记录、不重复扣线`
      );
      continue;
    }

    // 2) 底账对不上：无此地毯或破损框
    if (!frameExists(state, rec)) {
      const item = getOrCreateItem(state, rec);
      const bucket = rec.source === "archive" ? "archive" : "workshop";
      const updated: ReconItem = {
        ...item,
        [bucket]: [...item[bucket], rec],
        status: "orphan",
        lastError: "总店底账查无此地毯或破损框",
      };
      state = {
        ...state,
        items: { ...state.items, [key]: updated },
        seenReturnIds: rec.returnId
          ? {
              ...state.seenReturnIds,
              [rec.returnId]: { recordId: rec.recordId, key, at: rec.at },
            }
          : state.seenReturnIds,
      };
      state = log(
        state,
        "warn",
        `${rec.recordId} 对不上底账：${rec.carpetNo}/${rec.frameId} 不存在，挂起待总店核对编号`
      );
      continue;
    }

    // 3) 正常入库：追加版本，不覆盖
    const item = getOrCreateItem(state, rec);
    const bucket: Source = rec.source === "archive" ? "archive" : "workshop";
    let updated: ReconItem = {
      ...item,
      [bucket]: [...item[bucket], rec],
    };

    if (updated.status === "confirmed") {
      // 已确认：新版本只追加留档，状态不动
      state = log(
        state,
        "info",
        `${rec.carpetNo}/${rec.frameId}/${rec.process} 已于 ${
          updated.confirmed?.at ?? "-"
        } 确认扣线，新回传 ${rec.recordId} 仅留档，不重开对账`
      );
    } else {
      updated = recompute(updated);
    }

    state = {
      ...state,
      items: { ...state.items, [key]: updated },
      seenReturnIds: rec.returnId
        ? {
            ...state.seenReturnIds,
            [rec.returnId]: { recordId: rec.recordId, key, at: rec.at },
          }
        : state.seenReturnIds,
    };

    const otherSide = bucket === "archive" ? updated.workshop : updated.archive;
    if (otherSide.length > 0 && updated.status !== "confirmed") {
      if (updated.status === "matched") {
        state = log(
          state,
          "ok",
          `${rec.carpetNo}/${rec.frameId}/${rec.process} 两边记录一致，待确认扣线`
        );
      } else if (updated.status === "conflict") {
        state = log(
          state,
          "warn",
          `${rec.carpetNo}/${rec.frameId}/${rec.process} 两边都改过且不一致：两版均留档待人工确认`
        );
      }
    } else {
      state = log(
        state,
        "info",
        `登记 ${rec.source === "archive" ? "档案" : "工坊"}版 ${rec.recordId}（${
          rec.carpetNo
        }/${rec.frameId}/${rec.process}），等待对方记录`
      );
    }
  }

  state = {
    ...state,
    ingestedBatches: [...state.ingestedBatches, batch.id],
  };
  return log(state, "ok", `批次 ${batch.id} 接收完成`);
}

/** 取某一边最新一版作为裁决依据 */
function chosenRecord(item: ReconItem, side: Source): SrcRecord {
  const list = side === "archive" ? item.archive : item.workshop;
  return list[list.length - 1];
}

/**
 * 执行确认：按实测用量扣一次色卡。
 * 幂等：同一合并键已确认/已扣过 → 原样返回，绝不扣第二遍。
 * 库存不足：确认失败，状态保留，写清原因。
 */
export function confirmItem(
  prev: ReconState,
  key: string,
  side: Source,
  runId = "MANUAL"
): ReconState {
  const item = prev.items[key];
  if (!item) return log(prev, "error", `找不到对账项 ${key}`);
  if (item.status === "confirmed") {
    return log(
      prev,
      "info",
      `${item.carpetNo}/${item.frameId}/${item.process} 已确认，跳过重复确认（色卡不二次扣减）`
    );
  }
  if (item.status === "orphan") {
    return log(
      prev,
      "error",
      `${item.carpetNo}/${item.frameId} 底账缺失，无法确认，请先补建档`
    );
  }
  const rec = chosenRecord(item, side);
  if (!rec) return log(prev, "error", `${key} 该侧无记录可确认`);

  let state = { ...prev, cards: { ...prev.cards }, ledger: [...prev.ledger] };

  // 补线：校验并扣减色卡（台账幂等兜底）
  if (rec.process === "补线" && rec.usageMeters && rec.colorCardId) {
    const already = state.ledger.some((e) => e.key === key);
    if (already) {
      return log(prev, "warn", `${key} 色卡扣减台账已存在，拒绝二次扣减`);
    }
    const card = state.cards[rec.colorCardId];
    if (!card) {
      const failed: ReconItem = {
        ...item,
        lastError: `色卡 ${rec.colorCardId} 不存在`,
      };
      state = { ...state, items: { ...state.items, [key]: failed } };
      return log(state, "error", `${key} 确认失败：色卡 ${rec.colorCardId} 不存在`);
    }
    if (card.stockMeters + 1e-9 < rec.usageMeters) {
      const failed: ReconItem = {
        ...item,
        lastError: `${card.name}库存 ${card.stockMeters} 米，不足实测 ${rec.usageMeters} 米`,
      };
      state = { ...state, items: { ...state.items, [key]: failed } };
      return log(
        state,
        "error",
        `${key} 确认失败：${card.name}库存 ${card.stockMeters}m < 实测 ${rec.usageMeters}m，未扣减，待补线或改卡`
      );
    }
    const newCard: ColorCard = {
      ...card,
      stockMeters: round1(card.stockMeters - rec.usageMeters),
    };
    state = { ...state, cards: { ...state.cards, [card.id]: newCard } };
    state = {
      ...state,
      ledger: [
        ...state.ledger,
        {
          key,
          carpetNo: item.carpetNo,
          frameId: item.frameId,
          process: item.process,
          colorCardId: card.id,
          meters: rec.usageMeters,
          recordId: rec.recordId,
          returnId: rec.returnId,
          at: nowStamp(),
          runId,
        },
      ],
    };
  }

  const confirmation: Confirmation = {
    source: side,
    recordId: rec.recordId,
    returnId: rec.returnId,
    usageMeters: rec.usageMeters,
    colorCardId: rec.colorCardId,
    note: rec.note,
    at: nowStamp(),
    runId,
  };
  const done: ReconItem = {
    ...item,
    status: "confirmed",
    confirmed: confirmation,
    lastError: undefined,
  };
  state = { ...state, items: { ...state.items, [key]: done } };
  const deduct =
    rec.process === "补线" && rec.usageMeters
      ? `，扣 ${state.cards[rec.colorCardId!]?.name} ${rec.usageMeters}m`
      : "（无耗材，不扣色卡）";
  return log(
    state,
    "ok",
    `已确认 ${item.carpetNo}/${item.frameId}/${item.process}（采${
      side === "archive" ? "档案" : "工坊实测"
    }版 ${rec.recordId}）${deduct}`
  );
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export interface RunOptions {
  /** 故障注入：成功确认 N 项后中断（模拟对账跑到一半失败） */
  failAfter?: number;
}

export interface RunResult {
  state: ReconState;
  interrupted: boolean;
  confirmedKeys: string[];
}

function matchedKeys(state: ReconState): string[] {
  return Object.values(state.items)
    .filter((i) => i.status === "matched")
    .map((i) => i.key)
    .sort();
}

/**
 * 自动对账：只处理 matched 项，确认时以工坊实测版扣线。
 * 故障时已确认的地毯全部保留，落断点；恢复走 resume，只续做没对上的。
 */
export function runAutoRecon(
  prev: ReconState,
  opts: RunOptions = {}
): RunResult {
  const runId = `RUN-${prev.runSeq + 1}`;
  let state: ReconState = { ...prev, runSeq: prev.runSeq + 1, checkpoint: undefined };
  state = log(state, "info", `对账批次 ${runId} 开始，自动确认两边一致项`);

  const keys = matchedKeys(state);
  const confirmed: string[] = [];
  let interrupted = false;

  for (const key of keys) {
    // 一律用工坊实测版结算（matched 时两边签名相同）
    state = confirmItem(state, key, "workshop", runId);
    if (state.items[key].status === "confirmed") {
      confirmed.push(key);
      if (
        opts.failAfter !== undefined &&
        confirmed.length >= opts.failAfter
      ) {
        interrupted = true;
        break;
      }
    }
  }

  const remaining = matchedKeys(state).length;
  if (interrupted) {
    state = {
      ...state,
      checkpoint: {
        runId,
        interrupted: true,
        at: nowStamp(),
        remaining,
        confirmedCarpets: confirmedCarpetNos(state),
      },
    };
    state = log(
      state,
      "error",
      `对账中断：${runId} 在确认 ${confirmed.length} 项后失败，已确认成果保留；剩余 ${remaining} 项未对账，恢复后只续做这些`
    );
  } else {
    state = {
      ...state,
      checkpoint: {
        runId,
        interrupted: false,
        at: nowStamp(),
        remaining: 0,
        confirmedCarpets: confirmedCarpetNos(state),
      },
    };
    state = log(
      state,
      "ok",
      `对账批次 ${runId} 完成：自动确认 ${confirmed.length} 项` +
        (remaining > 0 ? `，${remaining} 项因库存等原因未确认` : "")
    );
  }
  return { state, interrupted, confirmedKeys: confirmed };
}

/** 从断点恢复：只续做当时没对上的 matched 项；已确认的不重跑 */
export function resumeAutoRecon(prev: ReconState): RunResult {
  const cp = prev.checkpoint;
  if (!cp?.interrupted) {
    return {
      state: log(prev, "info", "没有待恢复的断点，无需续对"),
      interrupted: false,
      confirmedKeys: [],
    };
  }
  let state = log(
    prev,
    "ok",
    `恢复对账：沿用 ${cp.runId}，已确认的 ${cp.confirmedCarpets.length} 张地毯成果保留，只续做未对上的 ${cp.remaining} 项`
  );
  const keys = matchedKeys(state);
  const confirmed: string[] = [];
  for (const key of keys) {
    state = confirmItem(state, key, "workshop", `${cp.runId}-R`);
    if (state.items[key].status === "confirmed") confirmed.push(key);
  }
  const remaining = matchedKeys(state).length;
  state = {
    ...state,
    checkpoint: {
      runId: cp.runId,
      interrupted: false,
      at: nowStamp(),
      remaining,
      confirmedCarpets: confirmedCarpetNos(state),
    },
  };
  state = log(
    state,
    "ok",
    `续对完成：本轮确认 ${confirmed.length} 项` +
      (remaining > 0 ? `，仍有 ${remaining} 项待补线/人工处理` : "，全部一致项已入账")
  );
  return { state, interrupted: false, confirmedKeys: confirmed };
}

function confirmedCarpetNos(state: ReconState): string[] {
  return [
    ...new Set(
      Object.values(state.items)
        .filter((i) => i.status === "confirmed")
        .map((i) => i.carpetNo)
    ),
  ].sort();
}

/** 色卡补线入库 */
export function restock(
  prev: ReconState,
  cardId: string,
  meters: number
): ReconState {
  const card = prev.cards[cardId];
  if (!card) return log(prev, "error", `色卡 ${cardId} 不存在`);
  const state: ReconState = {
    ...prev,
    cards: {
      ...prev.cards,
      [cardId]: { ...card, stockMeters: round1(card.stockMeters + meters) },
    },
  };
  return log(state, "ok", `${card.name}补线入库 ${meters}m，现库存 ${state.cards[cardId].stockMeters}m`);
}

export function countByStatus(state: ReconState): Record<ItemStatus, number> {
  const c: Record<ItemStatus, number> = {
    single: 0,
    matched: 0,
    conflict: 0,
    confirmed: 0,
    orphan: 0,
  };
  for (const it of Object.values(state.items)) c[it.status]++;
  return c;
}
