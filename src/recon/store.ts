import type { ReconState } from "./types";
import { initialState, seedArchiveRecords } from "./seed";
import { ingestBatch, log } from "./engine";

const STORAGE_KEY = "hxyfront-62009-recon-v1";

/** 初始工作台：三大底账就位，总店档案记录已先登记（等工坊回传） */
export function bootstrap(): ReconState {
  let state = initialState();
  state = log(state, "info", "系统初始化：修复档案、破损框、补线色卡三本底账就位");
  state = ingestBatch(state, {
    id: "ARCHIVE-SEED",
    title: "总店修复档案登记",
    at: "2026-09-28 09:00",
    records: seedArchiveRecords,
  });
  return state;
}

export function loadState(): ReconState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return bootstrap();
    const parsed = JSON.parse(raw) as ReconState;
    if (!parsed.items || parsed.runSeq === undefined) return bootstrap();
    return parsed;
  } catch {
    return bootstrap();
  }
}

export function saveState(state: ReconState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 存储不可用时仅影响持久化，不影响本次会话对账
  }
}

export function clearSaved(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
