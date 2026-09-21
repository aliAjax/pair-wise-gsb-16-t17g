import {
  AppState,
  Appointment,
  BlockedEar,
  BookInput,
  ConsistencyIssue,
  ConflictRecord,
  Counters,
  EarMold,
  Gains,
  LogEntry,
  ParamVersion,
  RescheduleDraft,
  ReworkOrder,
  Side,
  SIDE_LABEL,
  Slot,
  Trial,
  TrialRow,
  FREQ_BANDS,
} from "./types";

export const SATISFACTION_THRESHOLD = 80;

// ---------- 纯工具 ----------

export function overlap(a: Slot, b: Slot): boolean {
  // 时段端点相接不算重叠（上一场结束=下一场开始可借）
  return a.start < b.end && b.start < a.end;
}

export function fmtSlot(slot?: Slot): string {
  if (!slot) return "—";
  const s = slot.start.replace("T", " ");
  const e = slot.end.slice(11, 16);
  return `${s} - ${e}`;
}

export function now(): string {
  return new Date().toISOString();
}

export function nowLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function counterId(kind: keyof Counters, counters: Counters, prefix: string): string {
  const n = counters[kind] + 1;
  counters[kind] = n;
  return `${prefix}${String(n).padStart(3, "0")}`;
}

export function defaultGains(): Gains {
  return FREQ_BANDS.reduce((acc, band, i) => {
    acc[band] = [0, 4, 8, 12, 14, 12][i];
    return acc;
  }, {} as Gains);
}

function addLog(state: AppState, message: string, tone: LogEntry["tone"] = "info"): LogEntry {
  const entry: LogEntry = {
    id: counterId("log", state.counters, "LOG-"),
    at: now(),
    message,
    tone,
  };
  state.logs = [entry, ...state.logs].slice(0, 80);
  return entry;
}

function notice(state: AppState, kind: "ok" | "error", text: string): AppState {
  return { ...state, notice: { kind, text } };
}

// ---------- 选择器 ----------

// 占用设备的预约：已预约 / 待复核 / 已完成（试听未结束设备仍借出）
const OCCUPYING: Appointment["status"][] = ["booked", "pending_review", "completed"];

export function occupyingAppointments(state: AppState): Appointment[] {
  return state.appointments.filter((a) => OCCUPYING.includes(a.status));
}

export function deviceConflicts(
  state: AppState,
  deviceId: string,
  slot: Slot,
  excludeId?: string
): Appointment[] {
  return occupyingAppointments(state).filter(
    (a) => a.deviceId === deviceId && a.id !== excludeId && overlap(a.slot, slot)
  );
}

export function customerName(state: AppState, id: string): string {
  return state.customers.find((c) => c.id === id)?.name ?? id;
}

export function deviceLabel(state: AppState, id: string): string {
  const d = state.devices.find((x) => x.id === id);
  return d ? `${d.id} ${d.model}` : id;
}

export function moldById(state: AppState, id: string): EarMold | undefined {
  return state.molds.find((m) => m.id === id);
}

export function versionsForSide(
  state: AppState,
  caseId: string,
  side: Side
): ParamVersion[] {
  return state.versions
    .filter((v) => v.caseId === caseId && v.side === side)
    .sort((a, b) => a.no - b.no);
}

export function latestVersion(
  state: AppState,
  caseId: string,
  side: Side
): ParamVersion | undefined {
  const list = versionsForSide(state, caseId, side);
  return list[list.length - 1];
}

export function caseAppointments(state: AppState, caseId: string): Appointment[] {
  return state.appointments
    .filter((a) => a.caseId === caseId)
    .sort((a, b) => a.seq - b.seq);
}

export function activeConflicts(state: AppState): ConflictRecord[] {
  return state.conflicts.filter((c) => !c.dismissed);
}

export function openReworks(state: AppState): ReworkOrder[] {
  return state.reworks.filter((r) => r.status === "open");
}

export function pendingAppointments(state: AppState): Appointment[] {
  return state.appointments.filter((a) => a.status === "pending_review");
}

export function statusText(status: Appointment["status"]): string {
  return {
    booked: "已预约",
    pending_review: "待复核",
    completed: "已完成试听",
    released: "改期中（设备已释放）",
    rescheduled: "已改期",
  }[status];
}

// ---------- 业务动作 ----------

type Action =
  | { type: "BOOK"; input: BookInput }
  | { type: "RESCHEDULE_START"; appointmentId: string }
  | { type: "RESCHEDULE_CANCEL"; appointmentId: string }
  | {
      type: "RESCHEDULE_CONFIRM";
      appointmentId: string;
      deviceId: string;
      start: string;
      end: string;
    }
  | { type: "SUBMIT_TRIAL"; appointmentId: string; rows: TrialRow[] }
  | { type: "COMPLETE_REWORK"; reworkId: string; note: string; sterilize: boolean }
  | { type: "SET_STERILIZED"; moldId: string; value: boolean }
  | { type: "DISMISS_CONFLICT"; conflictId: string }
  | { type: "CLEAR_CONFLICTS" }
  | { type: "REFRESH" }
  | { type: "RESET_DEMO" }
  | { type: "CLEAR_NOTICE" };

function cloneState(state: AppState): AppState {
  return {
    ...state,
    customers: [...state.customers],
    devices: [...state.devices],
    molds: state.molds.map((m) => ({ ...m })),
    appointments: state.appointments.map((a) => ({
      ...a,
      slot: { ...a.slot },
      ears: a.ears.map((e) => ({ ...e })),
      blocked: a.blocked?.map((b) => ({ ...b, reasons: [...b.reasons] })),
      log: [...a.log],
    })),
    trials: state.trials.map((t) => ({ ...t, versionIds: [...t.versionIds] })),
    versions: state.versions.map((v) => ({ ...v, gains: { ...v.gains } })),
    reworks: state.reworks.map((r) => ({ ...r })),
    conflicts: state.conflicts.map((c) => ({
      ...c,
      requestedSlot: { ...c.requestedSlot },
      heldSlot: { ...c.heldSlot },
      originalSlot: c.originalSlot ? { ...c.originalSlot } : undefined,
    })),
    drafts: state.drafts.map((d) => ({
      ...d,
      originalSlot: { ...d.originalSlot },
    })),
    logs: [...state.logs],
    counters: { ...state.counters },
  };
}

function recordConflict(
  state: AppState,
  fields: Omit<ConflictRecord, "id" | "createdAt" | "dismissed">
): void {
  const record: ConflictRecord = {
    ...fields,
    id: counterId("conflict", state.counters, "CFL-"),
    createdAt: now(),
    dismissed: false,
  };
  state.conflicts = [record, ...state.conflicts].slice(0, 60);
}

function blockAppointment(
  state: AppState,
  appt: Appointment,
  blocked: BlockedEar[],
  newReworks: Array<{ mold: EarMold; reason: string }>
): void {
  appt.status = "pending_review";
  appt.blocked = blocked;

  for (const { mold, reason } of newReworks) {
    const existing = state.reworks.find(
      (r) => r.moldId === mold.id && r.status === "open" && r.reason === reason
    );
    if (existing) continue;
    const rw: ReworkOrder = {
      id: counterId("rework", state.counters, "RW-"),
      moldId: mold.id,
      customerId: appt.customerId,
      side: mold.side,
      reason,
      status: "open",
      sourceAppointmentId: appt.id,
      createdAt: now(),
    };
    state.reworks = [rw, ...state.reworks];
    mold.status = "rework";
    mold.openReworkId = rw.id;
    if (reason === "耳模未消毒") mold.sterilized = false;
  }

  appt.log = [
    ...appt.log,
    `试听登记被拦截，转入待复核：${blocked
      .flatMap((b) => b.reasons.map((r) => `${SIDE_LABEL[b.side]}·${r}`))
      .join("；")}`,
  ];
  addLog(
    state,
    `${appt.id} ${customerName(state, appt.customerId)} 因${blocked
      .flatMap((b) => b.reasons)
      .join("、")}未生成试听结果，已转待复核`,
    "danger"
  );
}

export function reducer(prev: AppState, action: Action): AppState {
  const state = cloneState(prev);
  state.notice = null;

  switch (action.type) {
    case "BOOK": {
      const { input } = action;
      const slot: Slot = { start: action.input.start, end: action.input.end };

      if (!input.start || !input.end || input.start >= input.end) {
        return notice(state, "error", "请填写合法的预约开始/结束时段");
      }
      if (input.ears.length === 0) {
        return notice(state, "error", "至少登记一只耳朵（左/右）");
      }

      // 客户
      let customerId = input.customerId;
      if (customerId === "new") {
        if (!input.newCustomerName?.trim()) {
          return notice(state, "error", "请填写新客户姓名");
        }
        customerId = `CUS-NEW-${state.counters.customer + 1}`;
      } else if (!state.customers.some((c) => c.id === customerId)) {
        return notice(state, "error", "所选客户不存在，请重新选择");
      }

      // 左右耳去重 + 耳模归属校验（在任何写入之前完成）
      const earSides = new Set<Side>();
      for (const row of input.ears) {
        if (earSides.has(row.side)) {
          return notice(state, "error", `${SIDE_LABEL[row.side]}重复登记，请检查`);
        }
        earSides.add(row.side);
        if (row.moldId !== "new") {
          const mold = prev.molds.find((m) => m.id === row.moldId);
          if (!mold || mold.customerId !== customerId || mold.side !== row.side) {
            return notice(
              state,
              "error",
              `${SIDE_LABEL[row.side]}选择的耳模 ${row.moldId} 不属于该客户或耳侧不匹配，请重新选择`
            );
          }
        }
      }

      // 同一设备不能重叠占用
      const clashes = deviceConflicts(state, input.deviceId, slot);
      if (clashes.length > 0) {
        for (const held of clashes) {
          recordConflict(state, {
            kind: "device_overlap",
            action: "book",
            requestedCustomerId: customerId,
            deviceId: input.deviceId,
            requestedSlot: slot,
            heldAppointmentId: held.id,
            heldCustomerId: held.customerId,
            heldSlot: held.slot,
          });
        }
        addLog(
          state,
          `预约被拒：${deviceLabel(state, input.deviceId)} 在 ${fmtSlot(slot)} 与 ${clashes
            .map((c) => c.id)
            .join("、")} 占用冲突`,
          "danger"
        );
        return notice(
          state,
          "error",
          `设备时段冲突：${deviceLabel(state, input.deviceId)} 已被 ${clashes
            .map((c) => `${customerName(state, c.customerId)}（${fmtSlot(c.slot)}）`)
            .join("；")} 占用，已列入冲突清单`
        );
      }

      // 新客户建档（校验全部通过后再写入）
      if (input.customerId === "new") {
        const c = {
          id: counterId("customer", state.counters, "CUS-"),
          name: input.newCustomerName!.trim(),
          tag: input.newCustomerTag || "初配",
        };
        state.customers = [...state.customers, c];
        customerId = c.id;
      }

      // case：复调沿用同客户最近链，否则新建
      const prior = state.appointments
        .filter(
          (a) =>
            a.customerId === customerId &&
            (a.status === "booked" ||
              a.status === "pending_review" ||
              a.status === "completed")
        )
        .sort((a, b) => b.seq - a.seq)[0];

      const caseId = prior
        ? prior.caseId
        : counterId("case", state.counters, "CASE-");
      const seq = prior ? prior.seq + 1 : 1;

      // 耳模：复用同客户同耳未归档耳模，否则新建借用耳模
      const ears = input.ears.map((row) => {
        let mold: EarMold | undefined;
        if (row.moldId !== "new") {
          mold = state.molds.find((m) => m.id === row.moldId);
        }
        if (!mold) {
          mold = {
            id: counterId("mold", state.counters, "EM-"),
            customerId,
            side: row.side,
            status: "in_use",
            sterilized: true,
          };
          state.molds = [...state.molds, mold];
        }
        return { side: row.side, moldId: mold.id };
      });

      const appt: Appointment = {
        id: counterId("appointment", state.counters, "APT-"),
        caseId,
        seq,
        customerId,
        deviceId: input.deviceId,
        slot,
        ears,
        status: "booked",
        log: [
          `创建预约：${customerName(state, customerId)} 借用 ${deviceLabel(
            state,
            input.deviceId
          )}，${fmtSlot(slot)}，${ears.map((e) => SIDE_LABEL[e.side]).join("/")}`,
        ],
      };
      state.appointments = [appt, ...state.appointments];
      addLog(
        state,
        `${appt.id} 预约成功：${customerName(state, customerId)} · ${deviceLabel(
          state,
          input.deviceId
        )} · ${fmtSlot(slot)}`,
        "ok"
      );
      return notice(
        state,
        "ok",
        `预约 ${appt.id} 已生成，试听机 ${fmtSlot(slot)} 占用锁定`
      );
    }

    case "RESCHEDULE_START": {
      const appt = state.appointments.find((a) => a.id === action.appointmentId);
      if (!appt) return state;
      if (
        appt.status !== "booked" &&
        appt.status !== "pending_review" &&
        appt.status !== "completed"
      ) {
        return notice(state, "error", "当前状态不允许改期");
      }
      const draft: RescheduleDraft = {
        appointmentId: appt.id,
        caseId: appt.caseId,
        customerId: appt.customerId,
        deviceId: appt.deviceId,
        priorStatus: appt.status,
        originalSlot: { ...appt.slot },
        releasedAt: now(),
      };
      if (!state.drafts.some((d) => d.appointmentId === appt.id)) {
        state.drafts = [...state.drafts, draft];
      }
      appt.status = "released";
      appt.log = [
        ...appt.log,
        `发起改期：先释放 ${deviceLabel(state, appt.deviceId)} 在 ${fmtSlot(
          appt.slot
        )} 的占用`,
      ];
      addLog(
        state,
        `${appt.id} 改期发起，设备 ${deviceLabel(state, appt.deviceId)} 已释放，原值 ${fmtSlot(
          draft.originalSlot
        )}`,
        "warn"
      );
      return notice(state, "ok", "试听机占用已释放，请确认新时段");
    }

    case "RESCHEDULE_CANCEL": {
      const draft = state.drafts.find((d) => d.appointmentId === action.appointmentId);
      const appt = state.appointments.find((a) => a.id === action.appointmentId);
      if (!draft || !appt) return state;
      // 回到释放前状态（重新占用原时段，若此时已被别人占用则提示）
      const clash = deviceConflicts(state, appt.deviceId, draft.originalSlot, appt.id);
      if (clash.length > 0) {
        return notice(
          state,
          "error",
          `无法撤回：原时段已被 ${clash
            .map((c) => `${customerName(state, c.customerId)}（${fmtSlot(c.slot)}）`)
            .join("；")} 占用，请直接确认新时段`
        );
      }
      appt.status = draft.priorStatus;
      appt.slot = { ...draft.originalSlot };
      appt.log = [...appt.log, "撤销改期，恢复原时段与设备占用"];
      state.drafts = state.drafts.filter((d) => d.appointmentId !== appt.id);
      addLog(state, `${appt.id} 撤销改期，恢复 ${fmtSlot(draft.originalSlot)}`, "info");
      return notice(state, "ok", "已恢复原时段占用");
    }

    case "RESCHEDULE_CONFIRM": {
      const draft = state.drafts.find((d) => d.appointmentId === action.appointmentId);
      const old = state.appointments.find((a) => a.id === action.appointmentId);
      if (!draft || !old) return state;
      const slot = { start: action.start, end: action.end };
      if (!action.start || !action.end || action.start >= action.end) {
        return notice(state, "error", "请填写合法的新时段");
      }
      // 新时段冲突校验（旧单已释放，不再占用设备）
      const clashes = deviceConflicts(state, action.deviceId, slot);
      if (clashes.length > 0) {
        for (const held of clashes) {
          recordConflict(state, {
            kind: "device_overlap",
            action: "reschedule",
            requestedCustomerId: old.customerId,
            deviceId: action.deviceId,
            requestedSlot: slot,
            heldAppointmentId: held.id,
            heldCustomerId: held.customerId,
            heldSlot: held.slot,
            originalSlot: { ...draft.originalSlot },
          });
        }
        addLog(
          state,
          `${old.id} 改期失败：${deviceLabel(state, action.deviceId)} 新时段 ${fmtSlot(
            slot
          )} 与 ${clashes.map((c) => c.id).join("、")} 冲突`,
          "danger"
        );
        return notice(
          state,
          "error",
          `改期冲突：${deviceLabel(state, action.deviceId)} 新时段已被 ${clashes
            .map((c) => `${customerName(state, c.customerId)}（${fmtSlot(c.slot)}）`)
            .join("；")} 占用，原值保留在改期单中`
        );
      }

      // 旧单作废
      old.status = "rescheduled";
      old.log = [
        ...old.log,
        `改期完成，本单作废；原值 ${fmtSlot(draft.originalSlot)} → 新单承接`,
      ];

      // 新单承接（同 caseId、同一对耳模、试听与版本链沿用）
      const next: Appointment = {
        id: counterId("appointment", state.counters, "APT-"),
        caseId: draft.caseId,
        seq:
          Math.max(
            ...state.appointments
              .filter((a) => a.caseId === draft.caseId)
              .map((a) => a.seq)
          ) + 1,
        customerId: draft.customerId,
        deviceId: action.deviceId,
        slot,
        ears: old.ears.map((e) => ({ ...e })),
        // 待复核单改期仍带拦截快照；已完成单改期进入下一轮试听，回到已预约
        status: draft.priorStatus === "pending_review" ? "pending_review" : "booked",
        createdFrom: old.id,
        blocked: old.blocked?.map((b) => ({ ...b, reasons: [...b.reasons] })),
        log: [
          `由 ${old.id} 改期生成：${deviceLabel(state, action.deviceId)} ${fmtSlot(slot)}`,
          `原值：${fmtSlot(draft.originalSlot)}（${deviceLabel(
            state,
            draft.deviceId
          )}）`,
        ],
      };
      state.appointments = [next, ...state.appointments];
      state.drafts = state.drafts.filter((d) => d.appointmentId !== old.id);
      addLog(
        state,
        `${next.id} 改期确认：${customerName(state, next.customerId)} ${fmtSlot(
          draft.originalSlot
        )} → ${fmtSlot(slot)}，耳模/试听/版本链按 case ${next.caseId} 沿用`,
        "ok"
      );
      return notice(
        state,
        "ok",
        `改期成功，新预约 ${next.id} 已占用 ${fmtSlot(slot)}，原单 ${old.id} 作废`
      );
    }

    case "SUBMIT_TRIAL": {
      const appt = state.appointments.find((a) => a.id === action.appointmentId);
      if (!appt) return state;
      if (appt.status !== "booked" && appt.status !== "pending_review") {
        return notice(state, "error", "当前预约状态不能登记试听");
      }

      // 硬校验：耳道红肿 或 耳模未消毒 → 不生成试听结果，只能转待复核
      const blocked: BlockedEar[] = [];
      const newReworks: Array<{ mold: EarMold; reason: string }> = [];
      for (const row of action.rows) {
        const ear = appt.ears.find((e) => e.side === row.side);
        if (!ear) continue;
        const mold = state.molds.find((m) => m.id === ear.moldId);
        const reasons: string[] = [];
        if (row.canalRed) {
          reasons.push("耳道红肿");
          if (mold) newReworks.push({ mold, reason: "耳道红肿" });
        }
        const sterilized = mold?.sterilized ?? false;
        if (!sterilized) {
          reasons.push("耳模未消毒");
          if (mold) newReworks.push({ mold, reason: "耳模未消毒" });
        }
        if (reasons.length > 0) {
          blocked.push({
            side: row.side,
            canalRed: row.canalRed,
            sterilized,
            reasons,
          });
        }
      }

      if (blocked.length > 0) {
        blockAppointment(state, appt, blocked, newReworks);
        return notice(
          state,
          "error",
          `安全校验未通过（${blocked
            .flatMap((b) => b.reasons)
            .join("、")}），未生成试听结果，已转入待复核并建立耳模返工单`
        );
      }

      // 满意度校验：<80 必须填写调整与新建版本原因
      for (const row of action.rows) {
        if (
          row.satisfaction < SATISFACTION_THRESHOLD &&
          (!row.adjustment.trim() || !row.reason.trim())
        ) {
          return notice(
            state,
            "error",
            `${SIDE_LABEL[row.side]}满意度 ${row.satisfaction} 低于 ${SATISFACTION_THRESHOLD}，须填写调整内容并填写新版本原因`
          );
        }
      }

      const trial: Trial = {
        id: counterId("trial", state.counters, "TRL-"),
        caseId: appt.caseId,
        appointmentId: appt.id,
        customerId: appt.customerId,
        result: "pass",
        versionIds: [],
        createdAt: now(),
      };

      const created: ParamVersion[] = [];
      for (const row of action.rows) {
        const parent = latestVersion(state, appt.caseId, row.side);
        if (parent) {
          // 旧参数保留：父版本标记为被替代
          parent.superseded = true;
        }
        const no = parent ? parent.no + 1 : 1;
        const low = row.satisfaction < SATISFACTION_THRESHOLD;
        const v: ParamVersion = {
          id: counterId("version", state.counters, "VER-"),
          caseId: appt.caseId,
          side: row.side,
          no,
          gains: { ...row.gains },
          satisfaction: row.satisfaction,
          adjustment: low ? row.adjustment.trim() : row.adjustment.trim() || undefined,
          reason: low ? row.reason.trim() : undefined,
          parentVersionId: parent?.id,
          trialId: trial.id,
          appointmentId: appt.id,
          createdAt: now(),
          superseded: false,
        };
        state.versions = [v, ...state.versions];
        created.push(v);
      }
      trial.versionIds = created.map((v) => v.id);
      trial.result = created.some(
        (v) => v.satisfaction < SATISFACTION_THRESHOLD
      )
        ? "readjust"
        : "pass";
      state.trials = [trial, ...state.trials];

      appt.trialId = trial.id;
      const lowSides = created.filter((v) => v.satisfaction < SATISFACTION_THRESHOLD);
      appt.log = [
        ...appt.log,
        `生成试听结果 ${trial.id}：${created
          .map(
            (v) =>
              `${SIDE_LABEL[v.side]} v${v.no} 满意度${v.satisfaction}${
                v.satisfaction < SATISFACTION_THRESHOLD ? "（已建新调参版本）" : ""
              }`
          )
          .join("；")}`,
      ];

      if (lowSides.length > 0) {
        appt.status = "completed";
        addLog(
          state,
          `${appt.id} 试听完成但 ${lowSides
            .map((v) => SIDE_LABEL[v.side] + "v" + v.no)
            .join("、")} 满意度低于${SATISFACTION_THRESHOLD}，已带原因新建版本，旧参数保留`,
          "warn"
        );
        return notice(
          state,
          "ok",
          `试听结果已记录；${lowSides
            .map((v) => `${SIDE_LABEL[v.side]}满意度 ${v.satisfaction}`)
            .join("、")} 低于 ${SATISFACTION_THRESHOLD}，调整已写入新版本，旧参数保留可追溯`
        );
      }

      appt.status = "completed";
      addLog(
        state,
        `${appt.id} 试听结果合格，${created
          .map((v) => `${SIDE_LABEL[v.side]}v${v.no}/${v.satisfaction}分`)
          .join("、")}`,
        "ok"
      );
      return notice(state, "ok", "试听结果已生成，预约闭环完成");
    }

    case "COMPLETE_REWORK": {
      const rw = state.reworks.find((r) => r.id === action.reworkId);
      if (!rw || rw.status !== "open") return state;
      rw.status = "done";
      rw.completedAt = now();
      rw.note = action.note.trim() || undefined;

      const mold = state.molds.find((m) => m.id === rw.moldId);
      if (mold) {
        mold.openReworkId = undefined;
        mold.sterilized = action.sterilize ? true : mold.sterilized;
        // 该耳模已无其他开放返工单 → 恢复在用
        const stillOpen = state.reworks.some(
          (r) => r.moldId === mold.id && r.status === "open"
        );
        if (!stillOpen) mold.status = "in_use";
      }

      // 耳道红肿返工完成后，清理关联待复核单在该耳上的红肿快照原因；
      // 若两耳拦截原因均已消除，预约恢复为已预约
      for (const appt of state.appointments) {
        if (appt.status !== "pending_review" || !appt.blocked) continue;
        const usedHere = appt.ears.some((e) => e.moldId === rw.moldId);
        if (!usedHere) continue;
        appt.blocked = appt.blocked
          .map((b) =>
            b.side === rw.side
              ? {
                  ...b,
                  reasons: b.reasons.filter(
                    (r) => r !== rw.reason
                  ),
                  canalRed: rw.reason === "耳道红肿" ? false : b.canalRed,
                  sterilized:
                    rw.reason === "耳模未消毒" ? true : b.sterilized,
                }
              : b
          )
          .filter((b) => b.reasons.length > 0);
        appt.log = [
          ...appt.log,
          `返工单 ${rw.id}（${SIDE_LABEL[rw.side]}·${rw.reason}）已完成`,
        ];
        if (appt.blocked.length === 0) {
          appt.blocked = undefined;
          appt.status = "booked";
          appt.log = [...appt.log, "复核通过，预约恢复为已预约，可重新登记试听"];
        }
      }

      addLog(
        state,
        `返工单 ${rw.id} 完成：${customerName(state, rw.customerId)} ${SIDE_LABEL[rw.side]}·${
          rw.reason
        }${action.sterilize ? "，耳模已消毒" : ""}`,
        "ok"
      );
      return notice(state, "ok", `返工单 ${rw.id} 已闭环，耳模恢复在用`);
    }

    case "SET_STERILIZED": {
      const mold = state.molds.find((m) => m.id === action.moldId);
      if (!mold) return state;
      mold.sterilized = action.value;
      addLog(
        state,
        `${mold.id} ${customerName(state, mold.customerId)}${SIDE_LABEL[mold.side]}耳模标记为${
          action.value ? "已消毒" : "未消毒"
        }`,
        "info"
      );
      return notice(state, "ok", action.value ? "耳模已消毒" : "耳模标记为未消毒");
    }

    case "DISMISS_CONFLICT": {
      const c = state.conflicts.find((x) => x.id === action.conflictId);
      if (c) c.dismissed = true;
      return state;
    }

    case "CLEAR_CONFLICTS": {
      state.conflicts = state.conflicts.map((c) => ({ ...c, dismissed: true }));
      return notice(state, "ok", "冲突清单已清空（记录仍可审计）");
    }

    case "REFRESH": {
      state.lastRefreshAt = now();
      const issues = checkConsistency(state);
      addLog(
        state,
        `数据刷新：${state.appointments.length} 个预约、${state.trials.length} 条试听、${state.versions.length} 个参数版本、${state.reworks.length} 张返工单，一致性${
          issues.length === 0 ? "校验通过" : `发现 ${issues.length} 项问题`
        }`,
        issues.length === 0 ? "ok" : "danger"
      );
      return notice(
        state,
        issues.length === 0 ? "ok" : "error",
        issues.length === 0
          ? "刷新完成：预约、耳模、试听与版本链一致"
          : `刷新发现 ${issues.length} 项一致性问题，请查看审计区`
      );
    }

    case "RESET_DEMO": {
      return { ...createInitialState(), lastRefreshAt: now() };
    }

    case "CLEAR_NOTICE":
      return { ...state, notice: null };

    default:
      return state;
  }
}

// ---------- 一致性审计：刷新后预约 / 耳模 / 试听 / 版本链 ----------

export function checkConsistency(state: AppState): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];

  // 1. 占用中的预约两两不得在同一设备上时段重叠
  const occ = occupyingAppointments(state);
  for (let i = 0; i < occ.length; i++) {
    for (let j = i + 1; j < occ.length; j++) {
      if (occ[i].deviceId === occ[j].deviceId && overlap(occ[i].slot, occ[j].slot)) {
        issues.push({
          level: "error",
          where: `${occ[i].id} ↔ ${occ[j].id}`,
          message: `同一试听机 ${deviceLabel(
            state,
            occ[i].deviceId
          )} 时段重叠：${fmtSlot(occ[i].slot)} / ${fmtSlot(occ[j].slot)}`,
        });
      }
    }
  }

  // 2. 改期草稿必须有对应的 released 预约
  for (const d of state.drafts) {
    const a = state.appointments.find((x) => x.id === d.appointmentId);
    if (!a) {
      issues.push({ level: "error", where: d.appointmentId, message: "改期草稿无对应预约" });
    } else if (a.status !== "released") {
      issues.push({
        level: "error",
        where: a.id,
        message: "存在改期草稿但预约状态不是“设备已释放”",
      });
    }
  }

  // 3. 预约引用的耳模必须存在
  for (const a of state.appointments) {
    for (const e of a.ears) {
      const m = state.molds.find((x) => x.id === e.moldId);
      if (!m)
        issues.push({
          level: "error",
          where: a.id,
          message: `${SIDE_LABEL[e.side]}引用的耳模 ${e.moldId} 不存在`,
        });
    }
  }

  // 4. 待复核预约：开放返工单必须覆盖其全部拦截原因；有开放返工单的耳模不得是在用态
  for (const a of pendingAppointments(state)) {
    if (!a.blocked || a.blocked.length === 0) {
      issues.push({
        level: "warn",
        where: a.id,
        message: "待复核预约缺少拦截原因快照",
      });
    }
  }
  for (const m of state.molds) {
    const open = state.reworks.filter((r) => r.moldId === m.id && r.status === "open");
    if (open.length > 0 && m.status !== "rework") {
      issues.push({
        level: "error",
        where: m.id,
        message: `有 ${open.length} 张开放返工单但耳模状态为${
          m.status === "in_use" ? "在用" : "已归档"
        }`,
      });
    }
  }

  // 5. 试听单必须挂在存在的预约上，且至少一个版本（满意度闭环在第 6 步版本链中校验）
  for (const t of state.trials) {
    const a = state.appointments.find((x) => x.id === t.appointmentId);
    if (!a)
      issues.push({ level: "error", where: t.id, message: "试听记录引用的预约不存在" });
    if (t.versionIds.length === 0)
      issues.push({ level: "error", where: t.id, message: "试听记录没有任何参数版本" });
    for (const vid of t.versionIds) {
      const v = state.versions.find((x) => x.id === vid);
      if (!v) {
        issues.push({ level: "error", where: t.id, message: `参数版本 ${vid} 丢失` });
        continue;
      }
    }
  }

  // 6. 版本链：同 case 同耳版本号连续、父指针正确、至多一个当前版本
  const groups = new Map<string, ParamVersion[]>();
  for (const v of state.versions) {
    const key = `${v.caseId}:${v.side}`;
    groups.set(key, [...(groups.get(key) ?? []), v]);
  }
  for (const [key, list] of groups) {
    const sorted = [...list].sort((a, b) => a.no - b.no);
    sorted.forEach((v, i) => {
      if (v.no !== i + 1)
        issues.push({
          level: "error",
          where: v.id,
          message: `${key} 版本号不连续（出现 v${v.no}）`,
        });
      if (i === 0 && v.parentVersionId) {
        issues.push({ level: "error", where: v.id, message: "首个版本不应有父版本" });
      }
      if (i > 0 && v.parentVersionId !== sorted[i - 1].id) {
        issues.push({
          level: "error",
          where: v.id,
          message: `${SIDE_LABEL[v.side]}v${v.no} 父指针未指向 v${v.no - 1}，版本链断裂`,
        });
      }
      // 满意度<80 规则：
      // - 当前版本满意度<80：必须自带调整内容与新建版本原因（尚未闭环）
      // - 已被替代的旧版本满意度<80：其数据原样保留，必须由紧随其后的新版本带原因承接
      if (v.satisfaction < SATISFACTION_THRESHOLD) {
        if (!v.superseded && (!v.adjustment || !v.reason)) {
          issues.push({
            level: "error",
            where: v.id,
            message: `${SIDE_LABEL[v.side]}v${v.no} 当前满意度${
              v.satisfaction
            }<${SATISFACTION_THRESHOLD}，缺少调整内容或版本原因`,
          });
        }
        const successor = sorted[i + 1];
        if (v.superseded && (!successor || !successor.parentVersionId)) {
          issues.push({
            level: "error",
            where: v.id,
            message: `${SIDE_LABEL[v.side]}v${v.no} 满意度${
              v.satisfaction
            }<${SATISFACTION_THRESHOLD} 已被替代，但后继版本未正确承接版本链`,
          });
        }
      }
    });
    const currents = sorted.filter((v) => !v.superseded);
    if (currents.length !== 1) {
      issues.push({
        level: "error",
        where: key,
        message: `版本链当前版本数量为 ${currents.length}（应为 1），旧参数保留状态异常`,
      });
    }
  }

  // 7. 冲突引用的占用单应当存在
  for (const c of state.conflicts) {
    const held = state.appointments.find((x) => x.id === c.heldAppointmentId);
    if (!held)
      issues.push({
        level: "warn",
        where: c.id,
        message: "冲突记录引用的占用预约已不存在",
      });
  }

  // 8. 已完成预约应关联试听记录
  for (const a of state.appointments.filter((x) => x.status === "completed")) {
    if (!a.trialId || !state.trials.some((t) => t.id === a.trialId)) {
      issues.push({ level: "error", where: a.id, message: "已完成预约缺少试听记录" });
    }
  }

  return issues;
}

// ---------- 演示数据 ----------

function gainsOf(values: number[]): Gains {
  return FREQ_BANDS.reduce((acc, band, i) => {
    acc[band] = values[i];
    return acc;
  }, {} as Gains);
}

export function createInitialState(): AppState {
  const counters: Counters = {
    customer: 0,
    device: 0,
    mold: 0,
    appointment: 0,
    case: 0,
    trial: 0,
    version: 0,
    rework: 0,
    conflict: 0,
    log: 0,
  };

  const state: AppState = {
    customers: [
      { id: "CUS-001", name: "刘女士", tag: "初配" },
      { id: "CUS-002", name: "陈先生", tag: "复调" },
      { id: "CUS-003", name: "赵阿姨", tag: "老人" },
    ],
    devices: [
      { id: "DEV-01", code: "TRY-A12", model: "RIC 试戴机（受话器外置）" },
      { id: "DEV-02", code: "TRY-B07", model: "BTE 试戴机（耳背式）" },
    ],
    molds: [],
    appointments: [],
    trials: [],
    versions: [],
    reworks: [],
    conflicts: [],
    drafts: [],
    logs: [],
    counters,
    notice: null,
  };
  counters.customer = 3;
  counters.device = 2;

  const mkMold = (customerId: string, side: Side, sterilized: boolean): EarMold => ({
    id: counterId("mold", counters, "EM-"),
    customerId,
    side,
    status: "in_use",
    sterilized,
  });

  // 刘女士：初配双耳，已完成一轮试听，左耳满意度 76 → 带原因建 v2，旧 v1 保留
  const liuL = mkMold("CUS-001", "L", true);
  const liuR = mkMold("CUS-001", "R", true);
  state.molds.push(liuL, liuR);

  const caseLiu = "CASE-001";
  counters.case = 1;
  const aptLiu: Appointment = {
    id: "APT-001",
    caseId: caseLiu,
    seq: 1,
    customerId: "CUS-001",
    deviceId: "DEV-01",
    slot: { start: "2026-09-18T09:00", end: "2026-09-18T10:30" },
    ears: [
      { side: "L", moldId: liuL.id },
      { side: "R", moldId: liuR.id },
    ],
    status: "completed",
    log: [],
  };

  const trlLiu: Trial = {
    id: "TRL-001",
    caseId: caseLiu,
    appointmentId: aptLiu.id,
    customerId: "CUS-001",
    result: "readjust",
    versionIds: [],
    createdAt: now(),
  };

  const liuV1: ParamVersion = {
    id: "VER-001",
    caseId: caseLiu,
    side: "L",
    no: 1,
    gains: gainsOf([0, 4, 8, 12, 14, 12]),
    satisfaction: 76,
    trialId: trlLiu.id,
    appointmentId: aptLiu.id,
    createdAt: now(),
    superseded: true,
  };
  const liuV2: ParamVersion = {
    id: "VER-002",
    caseId: caseLiu,
    side: "L",
    no: 2,
    gains: gainsOf([0, 6, 10, 16, 18, 14]),
    satisfaction: 88,
    adjustment: "2K/4K 各 +4dB，8K +2dB，降低高频压缩比",
    reason: "v1 满意度76：多人环境言语清晰度不足，高频增益偏小",
    parentVersionId: liuV1.id,
    trialId: trlLiu.id,
    appointmentId: aptLiu.id,
    createdAt: now(),
    superseded: false,
  };
  const liuRV1: ParamVersion = {
    id: "VER-003",
    caseId: caseLiu,
    side: "R",
    no: 1,
    gains: gainsOf([2, 6, 10, 14, 16, 14]),
    satisfaction: 84,
    trialId: trlLiu.id,
    appointmentId: aptLiu.id,
    createdAt: now(),
    superseded: false,
  };
  trlLiu.versionIds = [liuV1.id, liuV2.id, liuRV1.id];
  aptLiu.trialId = trlLiu.id;
  aptLiu.log = [
    "创建预约：刘女士 借用 DEV-01，2026-09-18 09:00 - 10:30，左耳/右耳",
    "生成试听结果 TRL-001：左耳 v1 满意度76（已建新调参版本）；右耳 v1 满意度84",
  ];
  counters.appointment = 1;
  counters.trial = 1;
  counters.version = 3;
  state.appointments.push(aptLiu);
  state.trials.push(trlLiu);
  state.versions.push(liuRV1, liuV2, liuV1);

  // 陈先生：复调链 CASE-002。原单已改期（设备释放后新单承接），当前新单 09-22
  const chenL = mkMold("CUS-002", "L", true);
  state.molds.push(chenL);
  const caseChen = "CASE-002";
  counters.case = 2;

  const aptChenOld: Appointment = {
    id: "APT-002",
    caseId: caseChen,
    seq: 1,
    customerId: "CUS-002",
    deviceId: "DEV-02",
    slot: { start: "2026-09-19T14:00", end: "2026-09-19T15:00" },
    ears: [{ side: "L", moldId: chenL.id }],
    status: "rescheduled",
    log: [
      "创建预约：陈先生 借用 DEV-02，2026-09-19 14:00 - 15:00，左耳",
      "发起改期：先释放 DEV-02 在 2026-09-19 14:00 - 15:00 的占用",
      "改期完成，本单作废；原值 2026-09-19 14:00 → 新单承接",
    ],
  };
  const aptChenNew: Appointment = {
    id: "APT-003",
    caseId: caseChen,
    seq: 2,
    customerId: "CUS-002",
    deviceId: "DEV-01",
    slot: { start: "2026-09-22T10:00", end: "2026-09-22T11:00" },
    ears: [{ side: "L", moldId: chenL.id }],
    status: "booked",
    createdFrom: aptChenOld.id,
    log: [
      "由 APT-002 改期生成：DEV-01 2026-09-22 10:00 - 11:00",
      "原值：2026-09-19 14:00 - 15:00（DEV-02）",
    ],
  };
  counters.appointment = 3;
  state.appointments.push(aptChenNew, aptChenOld);

  // 赵阿姨：待复核 —— 右耳耳道红肿且耳模未消毒，已生成返工单
  const zhaoL = mkMold("CUS-003", "L", true);
  const zhaoR = mkMold("CUS-003", "R", false);
  state.molds.push(zhaoL, zhaoR);
  const caseZhao = "CASE-003";
  counters.case = 3;

  const aptZhao: Appointment = {
    id: "APT-004",
    caseId: caseZhao,
    seq: 1,
    customerId: "CUS-003",
    deviceId: "DEV-02",
    slot: { start: "2026-09-22T14:00", end: "2026-09-22T15:30" },
    ears: [
      { side: "L", moldId: zhaoL.id },
      { side: "R", moldId: zhaoR.id },
    ],
    status: "pending_review",
    blocked: [
      {
        side: "R",
        canalRed: true,
        sterilized: false,
        reasons: ["耳道红肿", "耳模未消毒"],
      },
    ],
    log: [
      "创建预约：赵阿姨 借用 DEV-02，2026-09-22 14:00 - 15:30，左耳/右耳",
      "试听登记被拦截，转入待复核：右耳·耳道红肿；右耳·耳模未消毒",
    ],
  };
  counters.appointment = 4;
  state.appointments.push(aptZhao);

  const rw1: ReworkOrder = {
    id: "RW-001",
    moldId: zhaoR.id,
    customerId: "CUS-003",
    side: "R",
    reason: "耳道红肿",
    status: "open",
    sourceAppointmentId: aptZhao.id,
    createdAt: now(),
  };
  const rw2: ReworkOrder = {
    id: "RW-002",
    moldId: zhaoR.id,
    customerId: "CUS-003",
    side: "R",
    reason: "耳模未消毒",
    status: "open",
    sourceAppointmentId: aptZhao.id,
    createdAt: now(),
  };
  zhaoR.status = "rework";
  zhaoR.openReworkId = rw1.id;
  counters.rework = 2;
  state.reworks.push(rw1, rw2);

  addLog(state, "演示数据已加载：含已改期链、满意度版本链与待复核返工场景", "info");

  return state;
}
