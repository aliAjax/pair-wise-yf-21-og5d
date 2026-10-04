// 回传对账领域模型
// 三大底账：修复档案（总店）、破损框（地毯局部标记）、补线色卡（库存）
// 流水：合作工坊回传的施工记录，按批次到达

/** 工序 */
export type ProcessName = "清洗" | "补线" | "固色";

export type Source = "archive" | "workshop";

/** 地毯主档 */
export interface Carpet {
  no: string;
  origin: string;
  era: string;
  material: string;
  frames: DamageFrame[];
}

/** 破损框：地毯上的局部破损标记 */
export interface DamageFrame {
  id: string;
  part: string;
  damage: string;
}

/** 补线色卡（按米计库存） */
export interface ColorCard {
  id: string;
  name: string;
  hex: string;
  stockMeters: number;
}

/** 一条施工记录：可能来自总店修复档案，也可能来自工坊回传 */
export interface SrcRecord {
  /** 行记录唯一号 */
  recordId: string;
  /** 工坊回执号：同号再次到达即判定为重复回传 */
  returnId?: string;
  carpetNo: string;
  frameId: string;
  process: ProcessName;
  source: Source;
  batchId: string;
  /** 到达顺序，时间相同时仍可区分先后 */
  seq: number;
  at: string;
  editor: string;
  /** 实测用线量（米），仅补线工序 */
  usageMeters?: number;
  /** 取用色卡 */
  colorCardId?: string;
  /** 施工备注（清洗等无耗材工序以此对账） */
  note?: string;
}

/** 合并键：地毯编号 + 破损框 + 工序 */
export type MergeKey = string;

export type ItemStatus =
  | "single" // 只有一边有记录，单方待核
  | "matched" // 两边都有且内容一致，可自动确认
  | "conflict" // 两边都改过且不一致：两版都留档待人工裁决
  | "confirmed" // 已裁决确认（补线已扣色卡，且只扣一次）
  | "orphan"; // 地毯/破损框在总店底账中不存在，对不上

export interface Confirmation {
  source: Source;
  recordId: string;
  returnId?: string;
  usageMeters?: number;
  colorCardId?: string;
  note?: string;
  at: string;
  runId: string;
}

/** 合并后的对账记录 */
export interface ReconItem {
  key: MergeKey;
  carpetNo: string;
  frameId: string;
  process: ProcessName;
  /** 档案版（先到先存，后到永不覆盖） */
  archive: SrcRecord[];
  /** 工坊版：多次回传按到达顺序全部留档 */
  workshop: SrcRecord[];
  status: ItemStatus;
  confirmed?: Confirmation;
  lastError?: string;
}

/** 色卡扣减台账：每个合并键至多一条，是“只扣一次”的凭据 */
export interface LedgerEntry {
  key: MergeKey;
  carpetNo: string;
  frameId: string;
  process: ProcessName;
  colorCardId: string;
  meters: number;
  recordId: string;
  returnId?: string;
  at: string;
  runId: string;
}

/** 被拦下的重复回传 */
export interface DupeArrival {
  recordId: string;
  returnId: string;
  key: MergeKey;
  batchId: string;
  at: string;
}

export type LogLevel = "info" | "ok" | "warn" | "error";

export interface LogEntry {
  seq: number;
  at: string;
  level: LogLevel;
  msg: string;
}

/** 断点：对账中断时记录进度，恢复后只续做未对上的项 */
export interface Checkpoint {
  runId: string;
  interrupted: boolean;
  at: string;
  /** 中断时还剩多少可自动确认项 */
  remaining: number;
  /** 已确认地毯编号（确认成果永不回滚） */
  confirmedCarpets: string[];
}

export interface ReconState {
  carpets: Record<string, Carpet>;
  cards: Record<string, ColorCard>;
  items: Record<MergeKey, ReconItem>;
  seenReturnIds: Record<string, { recordId: string; key: MergeKey; at: string }>;
  dupes: DupeArrival[];
  ledger: LedgerEntry[];
  ingestedBatches: string[];
  log: LogEntry[];
  checkpoint?: Checkpoint;
  runSeq: number;
  logSeq: number;
}

export interface ReturnBatch {
  id: string;
  title: string;
  at: string;
  records: SrcRecord[];
}
