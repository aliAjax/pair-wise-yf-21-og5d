// 回传对账核心数据模型

export type FrameStatus = "pending" | "confirmed" | "conflict";
export type ReturnStatus = "pending" | "confirmed" | "conflict" | "failed" | "duplicate";
export type SessionStatus = "idle" | "running" | "failed" | "done";
export type VersionSource = "hq" | "workshop";

/** 一版施工内容：总店建档版 / 工坊回传版 */
export interface Version {
  source: VersionSource;
  description: string;
  threadColor: string; // 色卡编号
  measuredUsage: number; // 实测用量（米）
  updatedAt: number;
}

/** 破损框：按 地毯编号 + 框号 + 工序 合并的最小单元 */
export interface DamageFrame {
  id: string; // 破损框编号，如 F-2
  carpetId: string; // 地毯编号，如 CAR-092
  label: string; // 破损位置描述
  process: string; // 工序：清洗 / 补线
  x: number; // 纹样图坐标 %
  y: number;
  base: Version; // 最初建档版本（判断"两边都改过"的基准）
  hq?: Version; // 总店修改版
  workshop?: Version; // 工坊回传版
  status: FrameStatus;
  confirmedSource?: VersionSource;
  deducted?: boolean; // 是否已按实测用量扣过色卡
}

/** 补线色卡 */
export interface ColorCard {
  code: string;
  name: string;
  color: string; // 色卡展示色
  stock: number; // 当前库存
  unit: string;
  deducted: number; // 累计已扣用量
}

/** 工坊回传的一条施工记录 */
export interface ReturnRecord {
  id: string; // 回传记录编号 R-xxx
  carpetId: string;
  frameId: string;
  process: string;
  description: string;
  threadColor: string;
  measuredUsage: number; // 实测用量
  returnedAt: number;
  status: ReturnStatus;
  error?: string;
}

/** 修复档案中的地毯 */
export interface Carpet {
  id: string;
  origin: string; // 产地
  era: string; // 年代
  knotDensity: string; // 结密度
  material: string; // 材质
  dyeType: string; // 染色类型
}

/** 对账流水事件 */
export interface ReconcileEvent {
  id: string;
  time: number;
  kind: "confirm" | "conflict" | "duplicate" | "fail" | "start";
  message: string;
}

export interface AppState {
  carpets: Carpet[];
  frames: DamageFrame[];
  cards: ColorCard[];
  returns: ReturnRecord[];
  session: SessionStatus;
  events: ReconcileEvent[];
}
