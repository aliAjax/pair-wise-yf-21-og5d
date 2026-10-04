import type { AppState } from "./types";

const now = Date.now();
const DAY = 86400000;

export function buildSeedState(): AppState {
  const carpets = [
    {
      id: "CAR-092",
      origin: "波斯",
      era: "羊毛，约1960s",
      knotDensity: "结密度 36",
      material: "羊毛",
      dyeType: "植物染",
    },
    {
      id: "CAR-117",
      origin: "安纳托利亚",
      era: "约1950s",
      knotDensity: "结密度 42",
      material: "羊毛",
      dyeType: "植物染",
    },
    {
      id: "CAR-138",
      origin: "藏毯",
      era: "约1980s",
      knotDensity: "结密度 30",
      material: "羊毛",
      dyeType: "矿物染",
    },
  ];

  const v = (
    source: "hq" | "workshop",
    description: string,
    threadColor: string,
    measuredUsage: number,
    updatedAt: number
  ) => ({ source, description, threadColor, measuredUsage, updatedAt });

  const frames = [
    {
      id: "F-1",
      carpetId: "CAR-092",
      label: "边缘磨损",
      process: "清洗",
      x: 12,
      y: 52,
      base: v("hq", "边缘磨损待清洗", "NAT-00", 0, now - 3 * DAY),
      hq: v("hq", "边缘磨损待清洗", "NAT-00", 0, now - 3 * DAY),
      status: "pending" as const,
    },
    {
      id: "F-2",
      carpetId: "CAR-092",
      label: "边角补线",
      process: "补线",
      x: 88,
      y: 24,
      base: v("hq", "边角补线，茜草红", "MAD-03", 10, now - 3 * DAY),
      hq: v("hq", "边角补线（总店标注茜草红）", "MAD-03", 12, now - 2 * DAY),
      status: "pending" as const,
    },
    {
      id: "F-3",
      carpetId: "CAR-117",
      label: "中心纹样缺口",
      process: "补线",
      x: 50,
      y: 52,
      base: v("hq", "中心纹样缺口，靛蓝", "IND-07", 8, now - 3 * DAY),
      hq: v("hq", "中心纹样缺口，靛蓝", "IND-07", 8, now - 3 * DAY),
      status: "pending" as const,
    },
    {
      id: "F-4",
      carpetId: "CAR-138",
      label: "局部褪色",
      process: "清洗",
      x: 50,
      y: 82,
      base: v("hq", "局部褪色待清洗", "NAT-00", 0, now - 3 * DAY),
      hq: v("hq", "局部褪色待清洗", "NAT-00", 0, now - 3 * DAY),
      status: "pending" as const,
    },
  ];

  const cards = [
    { code: "IND-07", name: "靛蓝", color: "#2c4a7a", stock: 60, unit: "米", deducted: 0 },
    { code: "MAD-03", name: "茜草红", color: "#9e2b25", stock: 40, unit: "米", deducted: 0 },
    { code: "YEL-01", name: "槐黄", color: "#d9a441", stock: 30, unit: "米", deducted: 0 },
    { code: "NAT-00", name: "本白", color: "#d8d4cc", stock: 80, unit: "米", deducted: 0 },
  ];

  const returns = [
    {
      id: "R-001",
      carpetId: "CAR-092",
      frameId: "F-1",
      process: "清洗",
      description: "边缘磨损已清洗",
      threadColor: "NAT-00",
      measuredUsage: 0,
      returnedAt: now - DAY,
      status: "pending" as const,
    },
    {
      id: "R-002",
      carpetId: "CAR-092",
      frameId: "F-2",
      process: "补线",
      description: "边角补线（工坊实测茜草红）",
      threadColor: "MAD-03",
      measuredUsage: 14,
      returnedAt: now - DAY,
      status: "pending" as const,
    },
    {
      id: "R-003",
      carpetId: "CAR-117",
      frameId: "F-3",
      process: "补线",
      description: "中心纹样缺口已补线",
      threadColor: "IND-07",
      measuredUsage: 9,
      returnedAt: now - DAY,
      status: "pending" as const,
    },
    {
      id: "R-004",
      carpetId: "CAR-138",
      frameId: "F-4",
      process: "清洗",
      description: "局部褪色已清洗",
      threadColor: "NAT-00",
      measuredUsage: 0,
      returnedAt: now - DAY,
      status: "pending" as const,
    },
    {
      id: "R-005",
      carpetId: "CAR-092",
      frameId: "F-2",
      process: "补线",
      description: "边角补线（重复回传）",
      threadColor: "MAD-03",
      measuredUsage: 14,
      returnedAt: now - DAY + 1000,
      status: "pending" as const,
    },
    {
      id: "R-006",
      carpetId: "CAR-117",
      frameId: "F-3",
      process: "补线",
      description: "中心纹样缺口已补线（重复回传）",
      threadColor: "IND-07",
      measuredUsage: 9,
      returnedAt: now - DAY + 1000,
      status: "pending" as const,
    },
  ];

  return {
    carpets,
    frames,
    cards,
    returns,
    session: "idle",
    events: [],
  };
}
