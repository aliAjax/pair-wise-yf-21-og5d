// 回传对账引擎（纯函数，无副作用）
// 规则：
// 1. 记录按 地毯编号 + 破损框 + 工序 合并
// 2. 同一处两边都改过 -> 留两版待确认，后到的不覆盖先到的
// 3. 确认后才按实测用量扣一次色卡；重复回传不再扣第二遍
// 4. 对账失败：已确认的留住，未对上的留在待处理，恢复后只续做没对上的

import type {
  ColorCard,
  DamageFrame,
  ReconcileEvent,
  ReturnRecord,
  Version,
  VersionSource,
} from "./types";

export interface ReconcileOutcome {
  frames: DamageFrame[];
  cards: ColorCard[];
  returns: ReturnRecord[];
  events: ReconcileEvent[];
  failed: boolean;
  committedCount: number;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function versionFromReturn(ret: ReturnRecord): Version {
  return {
    source: "workshop",
    description: ret.description,
    threadColor: ret.threadColor,
    measuredUsage: ret.measuredUsage,
    updatedAt: ret.returnedAt,
  };
}

function sameVersion(a: Version, b: Version): boolean {
  return (
    a.description === b.description &&
    a.threadColor === b.threadColor &&
    a.measuredUsage === b.measuredUsage
  );
}

let eventSeq = 0;
function makeEvent(kind: ReconcileEvent["kind"], message: string): ReconcileEvent {
  eventSeq += 1;
  return { id: `E-${eventSeq}`, time: Date.now(), kind, message };
}

/** 按实测用量扣一次色卡；用量为 0（如清洗）不扣 */
function deductOnce(
  cards: ColorCard[],
  code: string,
  amount: number
): { cards: ColorCard[]; deducted: boolean } {
  if (amount <= 0) return { cards, deducted: false };
  let deducted = false;
  const next = cards.map((c) => {
    if (c.code !== code || deducted) return c;
    deducted = true;
    return { ...c, stock: c.stock - amount, deducted: c.deducted + amount };
  });
  return { cards: next, deducted };
}

/**
 * 跑一轮对账：只处理 status === "pending" 的回传。
 * failInjected 为 true 时，在第一条待处理记录上模拟对账失败（网络中断/校验超时），
 * 已确认的结果随返回值提交，未处理的保持 pending。
 */
export function runReconciliation(
  framesIn: DamageFrame[],
  cardsIn: ColorCard[],
  returnsIn: ReturnRecord[],
  opts: { failInjected?: boolean } = {}
): ReconcileOutcome {
  const frames = clone(framesIn);
  const cards = clone(cardsIn);
  const returns = clone(returnsIn);
  const events: ReconcileEvent[] = [];
  let failed = false;
  let committedCount = 0;

  const pendingCount = returns.filter((r) => r.status === "pending").length;
  events.push(
    makeEvent("start", `开始对账：${pendingCount} 条待处理回传，按地毯编号 / 破损框 / 工序合并`)
  );

  for (let i = 0; i < returns.length; i += 1) {
    const ret = returns[i];
    // pending=待处理；failed=上一轮对账失败、本轮恢复续做，都要处理
    if (ret.status !== "pending" && ret.status !== "failed") continue;
    if (ret.status === "failed") ret.error = undefined; // 恢复续做，清掉旧错误

    if (opts.failInjected) {
      ret.status = "failed";
      ret.error = "工坊回传校验超时（模拟对账失败）";
      events.push(
        makeEvent(
          "fail",
          `对账失败 ${ret.id}：${ret.error}。已留住此前已确认 ${committedCount} 条地毯，剩余未对上的待恢复后续做。`
        )
      );
      failed = true;
      break;
    }

    const frameIdx = frames.findIndex(
      (f) =>
        f.carpetId === ret.carpetId &&
        f.id === ret.frameId &&
        f.process === ret.process
    );

    if (frameIdx === -1) {
      // 修复档案里没有对应破损框：按回传建档并确认
      const v = versionFromReturn(ret);
      frames.push({
        id: ret.frameId,
        carpetId: ret.carpetId,
        label: ret.description,
        process: ret.process,
        x: 50,
        y: 50,
        base: v,
        workshop: v,
        status: "confirmed",
        confirmedSource: "workshop",
        deducted: true,
      });
      const d = deductOnce(cards, ret.threadColor, ret.measuredUsage);
      cards.splice(0, cards.length, ...d.cards);
      ret.status = "confirmed";
      committedCount += 1;
      events.push(
        makeEvent(
          "confirm",
          `已确认 ${ret.id}：修复档案无此框，已按回传建档，并按实测用量扣减 ${ret.threadColor} ${ret.measuredUsage} 米`
        )
      );
      continue;
    }

    const frame = frames[frameIdx];

    if (frame.status === "confirmed" || frame.deducted) {
      // 同一处已经确认并扣过：重复回传，不扣第二遍
      ret.status = "duplicate";
      events.push(
        makeEvent(
          "duplicate",
          `已跳过重复回传 ${ret.id}：${frame.carpetId} ${frame.id}（${frame.process}）已确认并扣减，不再扣第二遍`
        )
      );
      continue;
    }

    if (frame.status === "conflict") {
      // 该处已有两版待确认：后到的不覆盖先到的
      ret.status = "duplicate";
      events.push(
        makeEvent(
          "duplicate",
          `已跳过重复回传 ${ret.id}：${frame.carpetId} ${frame.id} 已有两版待确认，后到版本不覆盖先到版本`
        )
      );
      continue;
    }

    const workshopVersion = versionFromReturn(ret);
    const hqModified = frame.hq != null && !sameVersion(frame.hq, frame.base);
    const workshopModified = !sameVersion(workshopVersion, frame.base);

    if (hqModified && workshopModified) {
      // 两边都改过：留两版待确认，不覆盖
      frame.status = "conflict";
      frame.workshop = workshopVersion;
      ret.status = "conflict";
      events.push(
        makeEvent(
          "conflict",
          `两版待确认 ${ret.id}：${frame.carpetId} ${frame.id}（${frame.process}）总店版与工坊版都做过修改，留两版待确认，后到不盖先到`
        )
      );
      continue;
    }

    // 对上了：确认，按实测用量扣一次色卡
    frame.workshop = workshopVersion;
    frame.status = "confirmed";
    frame.confirmedSource = workshopModified ? "workshop" : "hq";
    frame.deducted = true;
    const d = deductOnce(cards, ret.threadColor, ret.measuredUsage);
    cards.splice(0, cards.length, ...d.cards);
    ret.status = "confirmed";
    committedCount += 1;
    events.push(
      makeEvent(
        "confirm",
        `已确认 ${ret.id}：${frame.carpetId} ${frame.id}（${frame.process}）按实测用量扣减 ${ret.threadColor} ${ret.measuredUsage} 米${
          d.deducted ? "" : "（无线材消耗不扣减）"
        }，重复回传不再扣`
      )
    );
  }

  if (!failed) {
    events.push(
      makeEvent("start", `对账完成：本次确认 ${committedCount} 条，色卡仅按实测用量扣一次，无重复扣减`)
    );
  }

  return { frames, cards, returns, events, failed, committedCount };
}

/**
 * 两版待确认时，人工确认采用哪一版：
 * 确认后才按该版实测用量扣一次色卡。
 */
export function confirmConflict(
  framesIn: DamageFrame[],
  cardsIn: ColorCard[],
  returnsIn: ReturnRecord[],
  frameId: string,
  source: VersionSource
): ReconcileOutcome {
  const frames = clone(framesIn);
  const cards = clone(cardsIn);
  const returns = clone(returnsIn);
  const events: ReconcileEvent[] = [];

  const frame = frames.find((f) => f.id === frameId);
  if (!frame || frame.status !== "conflict") {
    return { frames, cards, returns, events, failed: false, committedCount: 0 };
  }

  const chosen = source === "hq" ? frame.hq : frame.workshop;
  if (!chosen) {
    return { frames, cards, returns, events, failed: false, committedCount: 0 };
  }

  frame.status = "confirmed";
  frame.confirmedSource = source;
  frame.deducted = true;
  const d = deductOnce(cards, chosen.threadColor, chosen.measuredUsage);
  cards.splice(0, cards.length, ...d.cards);

  returns.forEach((r) => {
    if (
      r.carpetId === frame.carpetId &&
      r.frameId === frame.id &&
      r.process === frame.process &&
      r.status === "conflict"
    ) {
      r.status = "confirmed";
    }
  });

  events.push(
    makeEvent(
      "confirm",
      `已确认 ${frame.carpetId} ${frame.id}（${frame.process}）采用${
        source === "hq" ? "总店版" : "工坊版"
      }：按实测用量扣减 ${chosen.threadColor} ${chosen.measuredUsage} 米，重复回传不再扣第二遍`
    )
  );

  return { frames, cards, returns, events, failed: false, committedCount: 1 };
}
