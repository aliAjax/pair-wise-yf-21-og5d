import type {
  Carpet,
  ColorCard,
  ReconState,
  ReturnBatch,
  SrcRecord,
} from "./types";

/** 底账：地毯与破损框 */
export const seedCarpets: Carpet[] = [
  {
    no: "CAR-092",
    origin: "波斯",
    era: "约1960s",
    material: "羊毛",
    frames: [
      { id: "F1", part: "左缘边", damage: "边缘磨损待补线" },
      { id: "F2", part: "右上角", damage: "流苏缺失" },
    ],
  },
  {
    no: "CAR-117",
    origin: "安纳托利亚",
    era: "约1980s",
    material: "羊毛·植物染",
    frames: [
      { id: "F1", part: "中心纹样", damage: "中心纹样缺口" },
      { id: "F3", part: "底边", damage: "污斑" },
    ],
  },
  {
    no: "CAR-138",
    origin: "藏毯",
    era: "约1990s",
    material: "羊毛",
    frames: [{ id: "F2", part: "蓝地", damage: "局部褪色" }],
  },
  {
    no: "CAR-205",
    origin: "高加索",
    era: "约1970s",
    material: "羊毛",
    frames: [{ id: "F1", part: "左上角", damage: "破洞" }],
  },
];

/** 底账：补线色卡（库存按米） */
export const seedCards: ColorCard[] = [
  { id: "CC-01", name: "铁锈红", hex: "#7c2d12", stockMeters: 12 },
  { id: "CC-07", name: "赭石", hex: "#b45309", stockMeters: 9 },
  { id: "CC-14", name: "靛蓝", hex: "#1e3a8a", stockMeters: 6 },
  { id: "CC-22", name: "松绿", hex: "#0f766e", stockMeters: 2 },
];

/**
 * 总店修复档案里已有的施工记录（先到的一方）。
 * 用时间戳表示“先到”，工坊回传全部晚于档案。
 */
export const seedArchiveRecords: SrcRecord[] = [
  {
    recordId: "A-1001",
    carpetNo: "CAR-092",
    frameId: "F1",
    process: "补线",
    source: "archive",
    batchId: "ARCHIVE",
    seq: 1,
    at: "2026-09-28 09:10",
    editor: "总店·周师傅",
    usageMeters: 3,
    colorCardId: "CC-01",
    note: "档案登记铁锈红 3 米",
  },
  {
    recordId: "A-1002",
    carpetNo: "CAR-092",
    frameId: "F2",
    process: "补线",
    source: "archive",
    batchId: "ARCHIVE",
    seq: 2,
    at: "2026-09-28 09:20",
    editor: "总店·周师傅",
    usageMeters: 2,
    colorCardId: "CC-07",
    note: "档案登记赭石 2 米",
  },
  {
    recordId: "A-1003",
    carpetNo: "CAR-117",
    frameId: "F1",
    process: "补线",
    source: "archive",
    batchId: "ARCHIVE",
    seq: 3,
    at: "2026-09-28 09:30",
    editor: "总店·周师傅",
    usageMeters: 4,
    colorCardId: "CC-14",
    note: "档案登记靛蓝 4 米",
  },
  {
    recordId: "A-1004",
    carpetNo: "CAR-117",
    frameId: "F3",
    process: "清洗",
    source: "archive",
    batchId: "ARCHIVE",
    seq: 4,
    at: "2026-09-28 09:40",
    editor: "总店·内勤",
    note: "低温手洗完成",
  },
  {
    recordId: "A-1005",
    carpetNo: "CAR-205",
    frameId: "F1",
    process: "补线",
    source: "archive",
    batchId: "ARCHIVE",
    seq: 5,
    at: "2026-09-28 09:50",
    editor: "总店·周师傅",
    usageMeters: 1.5,
    colorCardId: "CC-22",
    note: "档案登记松绿 1.5 米（库存紧张）",
  },
];

/** 第一批工坊回传：含 3 个一致项（演示中断）与 1 个两边都改过的冲突 */
export const batchOne: ReturnBatch = {
  id: "WS-B1",
  title: "工坊第一批回传（10-01）",
  at: "2026-10-01 17:30",
  records: [
    {
      recordId: "W-2001",
      returnId: "RT-5001",
      carpetNo: "CAR-092",
      frameId: "F1",
      process: "补线",
      source: "workshop",
      batchId: "WS-B1",
      seq: 11,
      at: "2026-10-01 16:02",
      editor: "工坊·阿卜杜",
      usageMeters: 3,
      colorCardId: "CC-01",
      note: "实测铁锈红 3 米",
    },
    {
      recordId: "W-2002",
      returnId: "RT-5002",
      carpetNo: "CAR-092",
      frameId: "F2",
      process: "补线",
      source: "workshop",
      batchId: "WS-B1",
      seq: 12,
      at: "2026-10-01 16:10",
      editor: "工坊·阿卜杜",
      usageMeters: 2,
      colorCardId: "CC-07",
      note: "实测赭石 2 米",
    },
    {
      recordId: "W-2003",
      returnId: "RT-5003",
      carpetNo: "CAR-117",
      frameId: "F1",
      process: "补线",
      source: "workshop",
      batchId: "WS-B1",
      seq: 13,
      at: "2026-10-01 16:20",
      editor: "工坊·阿卜杜",
      // 两边都改过：档案 4 米，工坊实测 5 米，色卡也换了
      usageMeters: 5,
      colorCardId: "CC-07",
      note: "底色吃线，实测改用赭石 5 米",
    },
    {
      recordId: "W-2004",
      returnId: "RT-5004",
      carpetNo: "CAR-117",
      frameId: "F3",
      process: "清洗",
      source: "workshop",
      batchId: "WS-B1",
      seq: 14,
      at: "2026-10-01 16:30",
      editor: "工坊·清洗组",
      note: "低温手洗完成",
    },
  ],
};

/**
 * 第二批回传：
 * 一致项 / 冲突（待人工确认）/ 重复回传 / 库存不足 / 无主孤儿 全覆盖
 */
export const batchTwo: ReturnBatch = {
  id: "WS-B2",
  title: "工坊第二批回传（10-03）",
  at: "2026-10-03 11:00",
  records: [
    {
      recordId: "W-2101",
      returnId: "RT-5101",
      carpetNo: "CAR-138",
      frameId: "F2",
      process: "固色",
      source: "workshop",
      batchId: "WS-B2",
      seq: 21,
      at: "2026-10-03 09:10",
      editor: "工坊·固色组",
      note: "靛蓝区植物固色两遍",
    },
    {
      recordId: "W-2102",
      returnId: "RT-5102",
      carpetNo: "CAR-205",
      frameId: "F1",
      process: "补线",
      source: "workshop",
      batchId: "WS-B2",
      seq: 22,
      at: "2026-10-03 09:20",
      editor: "工坊·阿卜杜",
      // 实测 3.2 米，松绿色卡只剩 2 米 → 扣减必须失败
      usageMeters: 3.2,
      colorCardId: "CC-22",
      note: "破洞比预判大，实测松绿 3.2 米",
    },
    {
      recordId: "W-2103",
      returnId: "RT-5002", // 与 RT-5002 完全同号 → 重复回传
      carpetNo: "CAR-092",
      frameId: "F2",
      process: "补线",
      source: "workshop",
      batchId: "WS-B2",
      seq: 23,
      at: "2026-10-03 09:30",
      editor: "工坊·内勤重发",
      usageMeters: 2,
      colorCardId: "CC-07",
      note: "回执系统重发（网络超时补单）",
    },
    {
      recordId: "W-2104",
      returnId: "RT-5104",
      carpetNo: "CAR-999", // 总店底账查无此毯 → 孤儿
      frameId: "F1",
      process: "清洗",
      source: "workshop",
      batchId: "WS-B2",
      seq: 24,
      at: "2026-10-03 09:40",
      editor: "工坊·清洗组",
      note: "编号疑似写错",
    },
  ],
};

export function initialState(): ReconState {
  const state: ReconState = {
    carpets: {},
    cards: {},
    items: {},
    seenReturnIds: {},
    dupes: [],
    ledger: [],
    ingestedBatches: [],
    log: [],
    runSeq: 0,
    logSeq: 0,
  };
  for (const c of seedCarpets) state.carpets[c.no] = c;
  for (const card of seedCards) state.cards[card.id] = card;
  return state;
}

export const allBatches: ReturnBatch[] = [batchOne, batchTwo];
