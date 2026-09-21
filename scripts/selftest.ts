// 领域逻辑端到端自测：npx tsx scripts/selftest.ts
import { createInitialState, reducer, checkConsistency, SATISFACTION_THRESHOLD } from "../src/domain";
import { FREQ_BANDS, Gains, Side, TrialRow } from "../src/types";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.error("✗ FAIL:", msg);
  } else {
    console.log("✓", msg);
  }
}

const dispatch = (s: ReturnType<typeof createInitialState>, a: Parameters<typeof reducer>[1]) =>
  reducer(s, a);

const gains = (v: number): Gains =>
  FREQ_BANDS.reduce((acc, b) => ((acc[b] = v), acc), {} as Gains);

// ---------- 初始演示数据一致 ----------
let state = createInitialState();
assert(checkConsistency(state).length === 0, "演示数据初始一致性通过");
const apt4 = state.appointments.find((a) => a.id === "APT-004")!;
assert(apt4.status === "pending_review", "赵阿姨 APT-004 为待复核");
assert(state.reworks.filter((r) => r.status === "open").length === 2, "存在 2 张开放返工单");

// 版本链：刘女士左耳 v1(76)→v2(88)，v1 保留
const liu = state.versions
  .filter((v) => v.caseId === "CASE-001" && v.side === "L")
  .sort((a, b) => a.no - b.no);
assert(liu.length === 2 && liu[0].no === 1 && liu[1].no === 2, "左耳版本 v1/v2 存在");
assert(liu[0].superseded && !liu[1].superseded, "旧 v1 保留且被标记替代，v2 当前");
assert(!!liu[1].adjustment && !!liu[1].reason, "低满意度 v2 带调整与原因");
assert(liu[0].gains["2K"] === 12 && liu[1].gains["2K"] === 16, "旧参数原值未被覆盖");

// ---------- 1. 同设备时段重叠：新预约被拒 + 冲突清单 ----------
const before = state.appointments.length;
state = dispatch(state, {
  type: "BOOK",
  input: {
    customerId: "CUS-002",
    deviceId: "DEV-01",
    start: "2026-09-22T10:30",
    end: "2026-09-22T11:30",
    ears: [{ side: "L", moldId: "new" }],
  },
});
assert(state.appointments.length === before, "冲突预约未创建");
assert(state.conflicts.filter((c) => !c.dismissed).length >= 1, "冲突已入清单");
const cfl = state.conflicts[0];
assert(
  cfl.requestedCustomerId === "CUS-002" &&
    cfl.heldAppointmentId === "APT-003" &&
    cfl.deviceId === "DEV-01",
  "冲突记录客户/设备/占用单正确"
);

// 端点相接（10:00 结束的下一场 10:00 开始）应允许
state = dispatch(state, {
  type: "BOOK",
  input: {
    customerId: "CUS-001",
    deviceId: "DEV-01",
    start: "2026-09-18T10:30",
    end: "2026-09-18T11:00",
    ears: [{ side: "R", moldId: "EM-002" }],
  },
});
const edgeApt = state.appointments.find(
  (a) => a.slot.start === "2026-09-18T10:30"
);
assert(!!edgeApt && edgeApt.status === "booked", "时段端点相接允许借用");
assert(checkConsistency(state).length === 0, "相接预约后一致性仍通过");

// 耳模归属校验：刘客户不能用陈的耳模
state = dispatch(state, {
  type: "BOOK",
  input: {
    customerId: "CUS-001",
    deviceId: "DEV-02",
    start: "2026-10-02T09:00",
    end: "2026-10-02T10:00",
    ears: [{ side: "L", moldId: "EM-003" }], // 陈先生耳模
  },
});
assert(
  !state.appointments.some((a) => a.slot.start === "2026-10-02T09:00"),
  "跨客户耳模绑定被拒绝"
);

// ---------- 2. 耳道红肿/未消毒 → 不生成试听结果，转待复核 + 返工单 ----------
state = dispatch(state, { type: "DISMISS_CONFLICT", conflictId: cfl.id });
const target = edgeApt!;
function trialRows(overrides: Partial<TrialRow> & { side: Side }): TrialRow {
  return {
    canalRed: false,
    gains: gains(10),
    satisfaction: 90,
    adjustment: "",
    reason: "",
    ...overrides,
  };
}
state = dispatch(state, {
  type: "SUBMIT_TRIAL",
  appointmentId: target.id,
  rows: [trialRows({ side: "R", canalRed: true })],
});
const targetAfter = state.appointments.find((a) => a.id === target.id)!;
assert(targetAfter.status === "pending_review", "耳道红肿 → 转待复核");
assert(!state.trials.some((t) => t.appointmentId === target.id), "拦截时不生成试听/版本");
assert(
  state.reworks.some((r) => r.sourceAppointmentId === target.id && r.status === "open"),
  "自动开立返工单"
);
const reworkRed = state.reworks.find((r) => r.sourceAppointmentId === target.id)!;

// ---------- 3. 返工闭环后自动恢复已预约，再登记试听 ----------
state = dispatch(state, {
  type: "COMPLETE_REWORK",
  reworkId: reworkRed.id,
  note: "耳道恢复，耳模复检",
  sterilize: true,
});
const restored = state.appointments.find((a) => a.id === target.id)!;
assert(restored.status === "booked", "返工完成且无其他拦截 → 恢复已预约");

// 满意度 <80 但未填调整/原因 → 拒绝
state = dispatch(state, {
  type: "SUBMIT_TRIAL",
  appointmentId: target.id,
  rows: [trialRows({ side: "R", satisfaction: 60 })],
});
assert(
  state.appointments.find((a) => a.id === target.id)!.status === "booked",
  "满意度<80 缺调整原因 → 不予生成"
);

// 合格提交：满意度 72，带调整与原因 → 生成新版本（首版 v1），预约完成
state = dispatch(state, {
  type: "SUBMIT_TRIAL",
  appointmentId: target.id,
  rows: [
    trialRows({
      side: "R",
      satisfaction: 72,
      gains: gains(10),
      adjustment: "1K +2dB",
      reason: "v1 满意度72：安静环境发闷",
    }),
  ],
});
let done = state.appointments.find((a) => a.id === target.id)!;
assert(done.status === "completed" && !!done.trialId, "试听生成，预约完成");
const rChain = state.versions
  .filter((v) => v.appointmentId === target.id)
  .sort((a, b) => a.no - b.no);
assert(
  rChain.length === 1 && rChain[0].no === 2 && rChain[0].satisfaction === 72 && !!rChain[0].reason,
  "新试听在既有右耳链上生成 v2 且带满意度与原因"
);

// 再来一次试听（模拟复调）：旧参数保留，建 v2
const reschedId = done.id;
state = dispatch(state, {
  type: "RESCHEDULE_START",
  appointmentId: reschedId,
});
assert(
  state.appointments.find((a) => a.id === reschedId)!.status === "released",
  "改期先释放设备"
);
// 释放期间，别的客户可借同一设备同一时段
state = dispatch(state, {
  type: "BOOK",
  input: {
    customerId: "CUS-003",
    deviceId: "DEV-01",
    start: "2026-09-18T10:30",
    end: "2026-09-18T11:00",
    ears: [{ side: "L", moldId: "new" }],
  },
});
assert(
  state.appointments.some(
    (a) => a.customerId === "CUS-003" && a.slot.start === "2026-09-18T10:30" && a.status === "booked"
  ),
  "释放后原时段可被其他客户借用"
);
// 改到新时段确认 → 新单承接，旧单 rescheduled
state = dispatch(state, {
  type: "RESCHEDULE_CONFIRM",
  appointmentId: reschedId,
  deviceId: "DEV-02",
  start: "2026-09-25T09:00",
  end: "2026-09-25T10:00",
});
const oldApt = state.appointments.find((a) => a.id === reschedId)!;
assert(oldApt.status === "rescheduled", "旧单标记已改期");
const newApt = state.appointments.find((a) => a.createdFrom === reschedId)!;
assert(!!newApt && newApt.status === "booked", "新预约承接改期并进入下一轮试听（已预约）");
assert(newApt.ears[0].moldId === oldApt.ears[0].moldId, "同一耳模随 case 沿用");
assert(checkConsistency(state).length === 0, "改期后一致性通过");

// 新单再次试听 v2，验证旧参数保留
state = dispatch(state, {
  type: "SUBMIT_TRIAL",
  appointmentId: newApt.id,
  rows: [
    trialRows({
      side: "R",
      satisfaction: 91,
      gains: gains(14),
    }),
  ],
});
const chain = state.versions
  .filter((v) => v.caseId === newApt.caseId && v.side === "R")
  .sort((a, b) => a.no - b.no);
assert(chain.length === 3, "同 case 同耳版本链跨改期延续（v1→v2→v3）");
const oldOnes = chain.slice(0, -1);
assert(oldOnes.every((v) => v.superseded) && !chain[chain.length - 1].superseded, "跨改期旧参数保留、新版本当前");
assert(chain[2].parentVersionId === chain[1].id, "v3 父指针指向 v2");
assert(checkConsistency(state).length === 0, "全部操作后刷新一致性通过");

// ---------- 4. 改期冲突：新时段被占 → 记录原值，单仍 released ----------
const chenNew = state.appointments.find((a) => a.id === "APT-003")!;
state = dispatch(state, { type: "RESCHEDULE_START", appointmentId: chenNew.id });
const conflictsBefore = state.conflicts.filter((c) => !c.dismissed).length;
state = dispatch(state, {
  type: "RESCHEDULE_CONFIRM",
  appointmentId: "APT-003",
  deviceId: "DEV-02",
  start: "2026-09-22T14:30",
  end: "2026-09-22T15:00",
});
const reschedConflict = state.conflicts.find((c) => !c.dismissed && c.action === "reschedule");
assert(!!reschedConflict && state.conflicts.filter((c) => !c.dismissed).length === conflictsBefore + 1, "改期冲突入清单");
assert(
  !!reschedConflict?.originalSlot &&
    reschedConflict.originalSlot.start === "2026-09-22T10:00",
  "改期冲突带原值"
);
assert(
  state.appointments.find((a) => a.id === "APT-003")!.status === "released",
  "改期冲突后旧单保持 released，原值不丢"
);
assert(checkConsistency(state).length === 0, "含草稿/冲突时一致性仍通过");

// ---------- 5. 未消毒拦截 + 双原因返工单 ----------
const zhaoBlocked = state.appointments.find((a) => a.id === "APT-004")!;
assert(zhaoBlocked.blocked?.[0].reasons.includes("耳模未消毒"), "赵阿姨含未消毒原因");

// ---------- 阈值常量 ----------
assert(SATISFACTION_THRESHOLD === 80, "满意度阈值为 80");

console.log(failures === 0 ? "\n全部自测通过 ✅" : `\n${failures} 项失败 ❌`);
process.exit(failures === 0 ? 0 : 1);
