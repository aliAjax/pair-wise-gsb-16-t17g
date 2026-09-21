// 听力验配闭环：预约 / 试听机借用 / 耳模返工 / 试听记录 / 参数版本链

export type Side = "L" | "R";

export const SIDE_LABEL: Record<Side, string> = { L: "左耳", R: "右耳" };

export const FREQ_BANDS = ["250", "500", "1K", "2K", "4K", "8K"] as const;
export type FreqBand = (typeof FREQ_BANDS)[number];
export const FREQ_UNIT: Record<FreqBand, string> = {
  "250": "250Hz",
  "500": "500Hz",
  "1K": "1kHz",
  "2K": "2kHz",
  "4K": "4kHz",
  "8K": "8kHz",
};

export type Gains = Record<FreqBand, number>;

export type Customer = {
  id: string;
  name: string;
  tag: string; // 初配 / 复调 / 老人 / 儿童
};

export type TrialDevice = {
  id: string; // DEV-01
  code: string; // 设备资产编号
  model: string; // 型号
};

export type MoldStatus = "in_use" | "rework" | "archived";

export type EarMold = {
  id: string; // EM-...
  customerId: string;
  side: Side;
  status: MoldStatus;
  sterilized: boolean; // 是否已消毒
  openReworkId?: string;
};

export type Slot = {
  start: string; // datetime-local：YYYY-MM-DDTHH:mm
  end: string;
};

// 预约上记录的某只耳朵与耳模绑定
export type AppointmentEar = {
  side: Side;
  moldId: string;
};

// 转待复核时留存的现场快照
export type BlockedEar = {
  side: Side;
  canalRed: boolean;
  sterilized: boolean;
  reasons: string[];
};

export type AppointmentStatus =
  | "booked" // 已预约，设备占用中
  | "pending_review" // 待复核（耳道红肿/耳模未消毒）
  | "completed" // 已生成试听结果
  | "released" // 改期流程中：设备已释放，等待改期确认
  | "rescheduled"; // 改期完成，本单作废，由后继单承接

export type Appointment = {
  id: string;
  caseId: string; // 同一客户的复调链
  seq: number; // 链内第几次预约
  customerId: string;
  deviceId: string;
  slot: Slot;
  ears: AppointmentEar[];
  status: AppointmentStatus;
  createdFrom?: string; // 改期自哪个预约
  blocked?: BlockedEar[]; // 最近一次被拦截的快照
  trialId?: string;
  log: string[];
};

export type ParamVersion = {
  id: string;
  caseId: string;
  side: Side;
  no: number; // 该耳版本号 v1, v2 ...
  gains: Gains; // 分频增益
  satisfaction: number; // 满意度 0-100
  adjustment?: string; // 满意度<80 必填
  reason?: string; // 新建版本原因，<80 必填
  parentVersionId?: string; // 旧参数保留，形成链
  trialId: string;
  appointmentId: string;
  createdAt: string;
  superseded: boolean; // 是否已被新版本替代（旧参数仍保留）
};

export type TrialResult = "pass" | "readjust" | "none";

export type Trial = {
  id: string;
  caseId: string;
  appointmentId: string;
  customerId: string;
  result: TrialResult;
  versionIds: string[];
  createdAt: string;
};

export type ReworkStatus = "open" | "done";

export type ReworkOrder = {
  id: string;
  moldId: string;
  customerId: string;
  side: Side;
  reason: string; // 耳道红肿 / 耳模未消毒
  status: ReworkStatus;
  sourceAppointmentId: string;
  createdAt: string;
  completedAt?: string;
  note?: string;
};

export type ConflictRecord = {
  id: string;
  kind: "device_overlap";
  action: "book" | "reschedule";
  requestedCustomerId: string;
  deviceId: string;
  requestedSlot: Slot;
  heldAppointmentId: string;
  heldCustomerId: string;
  heldSlot: Slot; // 冲突占用时段
  originalSlot?: Slot; // 改期单的原值
  createdAt: string;
  dismissed: boolean;
};

// 改期草稿：旧单已释放设备，等待确认新时段
export type RescheduleDraft = {
  appointmentId: string;
  caseId: string;
  customerId: string;
  deviceId: string;
  priorStatus: AppointmentStatus;
  originalSlot: Slot;
  releasedAt: string;
};

export type LogEntry = {
  id: string;
  at: string;
  message: string;
  tone: "info" | "ok" | "warn" | "danger";
};

export type Notice = { kind: "ok" | "error"; text: string } | null;

export type Counters = {
  customer: number;
  device: number;
  mold: number;
  appointment: number;
  case: number;
  trial: number;
  version: number;
  rework: number;
  conflict: number;
  log: number;
};

export type AppState = {
  customers: Customer[];
  devices: TrialDevice[];
  molds: EarMold[];
  appointments: Appointment[];
  trials: Trial[];
  versions: ParamVersion[];
  reworks: ReworkOrder[];
  conflicts: ConflictRecord[];
  drafts: RescheduleDraft[];
  logs: LogEntry[];
  counters: Counters;
  lastRefreshAt?: string;
  notice: Notice;
};

export type BookEarInput = {
  side: Side;
  moldId: string; // 已有耳模 id，或 "new"
};

export type BookInput = {
  customerId: string; // 或 "new"
  newCustomerName?: string;
  newCustomerTag?: string;
  deviceId: string;
  start: string;
  end: string;
  ears: BookEarInput[];
};

export type TrialRow = {
  side: Side;
  canalRed: boolean;
  gains: Gains;
  satisfaction: number;
  adjustment: string;
  reason: string;
};

export type ConsistencyIssue = {
  level: "error" | "warn";
  where: string;
  message: string;
};
