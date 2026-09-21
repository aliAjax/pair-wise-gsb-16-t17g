import { useEffect, useMemo, useReducer, useState } from "react";
import "./styles.css";

/* ============================= 类型与常量 ============================= */

type EarSide = "left" | "right";
type CanalStatus = "正常" | "红肿";
type EarmoldStatus = "可用" | "返工中";
type AppointmentStatus = "已预约" | "已完成" | "待复核" | "已改期";
type TrialStatus = "已生成" | "待复核";

interface EarRecord {
  side: EarSide;
  pta: number; // dB HL
  speechRecog: number; // %
  canal: CanalStatus;
}

interface Customer {
  id: string;
  name: string;
  tag: string;
  ears: Record<EarSide, EarRecord>;
}

interface Earmold {
  id: string;
  customerId: string;
  side: EarSide;
  disinfected: boolean;
  status: EarmoldStatus;
  reworkReason?: string;
}

interface Device {
  id: string;
  name: string;
  model: string;
}

interface Appointment {
  id: string;
  customerId: string;
  earmoldId: string;
  deviceId: string;
  date: string;
  slot: string;
  status: AppointmentStatus;
}

interface TrialRecord {
  id: string;
  appointmentId: string;
  customerId: string;
  gains: Record<string, number>;
  satisfaction: number;
  status: TrialStatus;
  blockReason?: string;
}

interface ParamVersion {
  id: string;
  customerId: string;
  trialId: string;
  version: number;
  reason: string;
  adjustment: string;
  gains: Record<string, number>;
  superseded: boolean;
}

interface Conflict {
  id: string;
  customer: string;
  device: string;
  slot: string;
  original: string;
}

interface State {
  customers: Customer[];
  earmolds: Earmold[];
  devices: Device[];
  appointments: Appointment[];
  trials: TrialRecord[];
  versions: ParamVersion[];
  conflicts: Conflict[];
}

const SLOTS = ["09:00-10:00", "10:00-11:00", "11:00-12:00", "14:00-15:00", "15:00-16:00", "16:00-17:00"];
const BANDS = ["250Hz", "500Hz", "1kHz", "2kHz", "4kHz", "8kHz"];
const DATES = ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25"];
const SATISFACTION_MIN = 80;

const sideLabel = (s: EarSide) => (s === "left" ? "左耳" : "右耳");
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/* ============================= 种子数据 ============================= */

const seedState: State = {
  customers: [
    {
      id: "c1",
      name: "刘慧兰",
      tag: "Liu-024 · 复调",
      ears: {
        left: { side: "left", pta: 55, speechRecog: 76, canal: "正常" },
        right: { side: "right", pta: 60, speechRecog: 72, canal: "正常" },
      },
    },
    {
      id: "c2",
      name: "陈国强",
      tag: "Chen-118 · 复调",
      ears: {
        left: { side: "left", pta: 48, speechRecog: 80, canal: "红肿" },
        right: { side: "right", pta: 52, speechRecog: 78, canal: "正常" },
      },
    },
    {
      id: "c3",
      name: "赵淑芬",
      tag: "Zhao-077 · 复诊",
      ears: {
        left: { side: "left", pta: 62, speechRecog: 64, canal: "正常" },
        right: { side: "right", pta: 58, speechRecog: 68, canal: "正常" },
      },
    },
  ],
  earmolds: [
    { id: "e1", customerId: "c1", side: "left", disinfected: true, status: "可用" },
    { id: "e2", customerId: "c1", side: "right", disinfected: true, status: "可用" },
    { id: "e3", customerId: "c2", side: "left", disinfected: false, status: "可用" },
    { id: "e4", customerId: "c3", side: "right", disinfected: false, status: "返工中", reworkReason: "耳钩处漏音" },
  ],
  devices: [
    { id: "d1", name: "试听机A", model: "RIC-XT" },
    { id: "d2", name: "试听机B", model: "BTE-Pro" },
    { id: "d3", name: "试听机C", model: "CIC-Mini" },
  ],
  appointments: [
    { id: "a1", customerId: "c1", earmoldId: "e1", deviceId: "d1", date: "2026-09-21", slot: "09:00-10:00", status: "已预约" },
    { id: "a2", customerId: "c2", earmoldId: "e3", deviceId: "d2", date: "2026-09-21", slot: "10:00-11:00", status: "已预约" },
    { id: "a3", customerId: "c1", earmoldId: "e2", deviceId: "d1", date: "2026-09-22", slot: "14:00-15:00", status: "已预约" },
  ],
  trials: [],
  versions: [
    {
      id: "v1",
      customerId: "c1",
      trialId: "",
      version: 1,
      reason: "初配处方",
      adjustment: "按听力图初始处方给增益",
      gains: { "250Hz": 18, "500Hz": 24, "1kHz": 32, "2kHz": 38, "4kHz": 42, "8kHz": 36 },
      superseded: false,
    },
  ],
  conflicts: [],
};

/* ============================= 规则与 Reducer ============================= */

const isActiveAppt = (a: Appointment) => a.status === "已预约" || a.status === "待复核";

function deviceBusy(appointments: Appointment[], deviceId: string, date: string, slot: string, excludeId?: string) {
  return appointments.some(
    (a) => a.id !== excludeId && isActiveAppt(a) && a.deviceId === deviceId && a.date === date && a.slot === slot
  );
}

type Action =
  | { type: "ADD_APPOINTMENT"; appointment: Appointment }
  | { type: "RESCHEDULE"; appointmentId: string; newAppointment?: Appointment; conflict?: Conflict }
  | { type: "ADD_TRIAL"; trial: TrialRecord }
  | { type: "ADD_VERSION"; version: ParamVersion }
  | { type: "EARMOLD_STATUS"; earmoldId: string; status: EarmoldStatus; disinfected?: boolean; reason?: string }
  | { type: "RESET" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "ADD_APPOINTMENT":
      return { ...state, appointments: [...state.appointments, action.appointment] };

    case "RESCHEDULE": {
      // 先释放设备：原预约置为「已改期」，设备与时段立即让出
      const appointments = state.appointments.map((a) =>
        a.id === action.appointmentId ? { ...a, status: "已改期" as AppointmentStatus } : a
      );
      if (action.newAppointment) appointments.push(action.newAppointment);
      return {
        ...state,
        appointments,
        conflicts: action.conflict ? [...state.conflicts, action.conflict] : state.conflicts,
      };
    }

    case "ADD_TRIAL": {
      const appointments = state.appointments.map((a) =>
        a.id === action.trial.appointmentId
          ? { ...a, status: action.trial.status === "已生成" ? ("已完成" as AppointmentStatus) : ("待复核" as AppointmentStatus) }
          : a
      );
      return { ...state, appointments, trials: [...state.trials, action.trial] };
    }

    case "ADD_VERSION":
      // 旧参数保留：仅标记为历史版本，不删除
      return {
        ...state,
        versions: [
          ...state.versions.map((v) => (v.customerId === action.version.customerId ? { ...v, superseded: true } : v)),
          action.version,
        ],
      };

    case "EARMOLD_STATUS":
      return {
        ...state,
        earmolds: state.earmolds.map((e) =>
          e.id === action.earmoldId
            ? {
                ...e,
                status: action.status,
                disinfected: action.disinfected ?? e.disinfected,
                reworkReason: action.status === "返工中" ? action.reason : undefined,
              }
            : e
        ),
      };

    case "RESET":
      return seedState;
  }
}

const STORAGE_KEY = "hxwl-fitting-loop-v1";

function initState(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as State;
  } catch {
    /* 忽略损坏缓存 */
  }
  return seedState;
}

/* ============================= 页面组件 ============================= */

const project = {
  id: "hxwl-01",
  port: 5101,
  title: "听力验配复调闭环",
  subtitle: "复调预约 · 试听机借用 · 耳模返工 · 分频增益版本链的一体化工作台",
  stack: "React + Vite + TypeScript + CSS",
};

function Badge({ tone, children }: { tone: "ok" | "warn" | "danger" | "muted"; children: React.ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

function apptBadge(status: AppointmentStatus) {
  if (status === "已预约") return <Badge tone="ok">已预约</Badge>;
  if (status === "已完成") return <Badge tone="muted">已完成</Badge>;
  if (status === "待复核") return <Badge tone="warn">待复核</Badge>;
  return <Badge tone="muted">已改期</Badge>;
}

function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initState);
  const [notice, setNotice] = useState("");

  // 刷新后保持一致：预约、耳模、试听与版本链整体持久化
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const customerOf = (id: string) => state.customers.find((c) => c.id === id);
  const earmoldOf = (id: string) => state.earmolds.find((e) => e.id === id);
  const deviceOf = (id: string) => state.devices.find((d) => d.id === id);
  const deviceName = (id: string) => {
    const d = deviceOf(id);
    return d ? `${d.name}·${d.model}` : id;
  };

  const metrics = useMemo(() => {
    const active = state.appointments.filter(isActiveAppt).length;
    const review =
      state.appointments.filter((a) => a.status === "待复核").length +
      state.trials.filter((t) => t.status === "待复核").length;
    const busyDevices = new Set(state.appointments.filter(isActiveAppt).map((a) => a.deviceId)).size;
    return [
      { label: "有效预约", value: active },
      { label: "待复核", value: review },
      { label: "占用试听机", value: busyDevices },
      { label: "参数版本", value: state.versions.length },
    ];
  }, [state]);

  /* ---------- 预约表单 ---------- */
  const [apptForm, setApptForm] = useState({ customerId: "c1", earmoldId: "e1", deviceId: "d1", date: DATES[0], slot: SLOTS[0] });
  const [apptError, setApptError] = useState("");

  const customerEarmolds = state.earmolds.filter((e) => e.customerId === apptForm.customerId);

  const submitAppointment = () => {
    const earmold = earmoldOf(apptForm.earmoldId);
    if (!earmold || earmold.customerId !== apptForm.customerId) {
      setApptError("请选择该客户名下的耳模");
      return;
    }
    if (earmold.status !== "可用") {
      setApptError(`耳模「${sideLabel(earmold.side)}」返工中（${earmold.reworkReason ?? "未注明"}），完成返工前不能预约试听`);
      return;
    }
    if (deviceBusy(state.appointments, apptForm.deviceId, apptForm.date, apptForm.slot)) {
      setApptError(`${deviceName(apptForm.deviceId)} 在 ${apptForm.date} ${apptForm.slot} 已被占用，同一设备不能重叠占用`);
      return;
    }
    dispatch({
      type: "ADD_APPOINTMENT",
      appointment: { id: uid("a"), status: "已预约", ...apptForm },
    });
    setApptError("");
    setNotice(`已为 ${customerOf(apptForm.customerId)?.name} 预约 ${deviceName(apptForm.deviceId)} · ${apptForm.date} ${apptForm.slot}`);
  };

  /* ---------- 试听表单 ---------- */
  const activeAppts = state.appointments.filter((a) => a.status === "已预约");
  const [trialForm, setTrialForm] = useState({ appointmentId: "", satisfaction: "85" });
  const [gains, setGains] = useState<Record<string, string>>(() =>
    Object.fromEntries(BANDS.map((b) => [b, "30"]))
  );

  const trialAppt = state.appointments.find((a) => a.id === trialForm.appointmentId);
  const trialCustomer = trialAppt ? customerOf(trialAppt.customerId) : undefined;
  const trialEarmold = trialAppt ? earmoldOf(trialAppt.earmoldId) : undefined;

  // 阻断条件：耳道红肿 / 耳模未消毒 / 耳模返工中 → 不得生成试听结果，只能待复核
  const blockers: string[] = [];
  if (trialCustomer) {
    (["left", "right"] as EarSide[]).forEach((s) => {
      if (trialCustomer.ears[s].canal === "红肿") blockers.push(`${sideLabel(s)}耳道红肿`);
    });
  }
  if (trialEarmold && !trialEarmold.disinfected) blockers.push(`耳模（${sideLabel(trialEarmold.side)}）未消毒`);
  if (trialEarmold && trialEarmold.status === "返工中") blockers.push(`耳模（${sideLabel(trialEarmold.side)}）返工中`);

  const submitTrial = () => {
    if (!trialAppt || !trialCustomer) return;
    const sat = Number(trialForm.satisfaction);
    if (Number.isNaN(sat) || sat < 0 || sat > 100) return;
    const blocked = blockers.length > 0;
    const trial: TrialRecord = {
      id: uid("t"),
      appointmentId: trialAppt.id,
      customerId: trialCustomer.id,
      gains: Object.fromEntries(BANDS.map((b) => [b, Number(gains[b]) || 0])),
      satisfaction: sat,
      status: blocked ? "待复核" : "已生成",
      blockReason: blocked ? blockers.join("；") : undefined,
    };
    dispatch({ type: "ADD_TRIAL", trial });
    setNotice(
      blocked
        ? `存在「${trial.blockReason}」，不得生成试听结果，已转入待复核`
        : sat < SATISFACTION_MIN
          ? `试听结果已生成；满意度 ${sat} 低于 ${SATISFACTION_MIN}，须填写调整并新建带原因版本`
          : "试听结果已生成"
    );
    setTrialForm({ appointmentId: "", satisfaction: "85" });
  };

  /* ---------- 版本表单（满意度 < 80） ---------- */
  const [versionForms, setVersionForms] = useState<Record<string, { reason: string; adjustment: string; gains: Record<string, string> }>>({});
  const [versionErrors, setVersionErrors] = useState<Record<string, string>>({});

  const trialsNeedingVersion = state.trials.filter(
    (t) => t.status === "已生成" && t.satisfaction < SATISFACTION_MIN && !state.versions.some((v) => v.trialId === t.id)
  );

  const versionFormOf = (trial: TrialRecord) =>
    versionForms[trial.id] ?? {
      reason: "",
      adjustment: "",
      gains: Object.fromEntries(BANDS.map((b) => [b, String(trial.gains[b])])),
    };

  const submitVersion = (trial: TrialRecord) => {
    const form = versionFormOf(trial);
    if (!form.adjustment.trim() || !form.reason.trim()) {
      setVersionErrors((p) => ({ ...p, [trial.id]: `满意度低于 ${SATISFACTION_MIN}，必须填写调整说明与版本原因` }));
      return;
    }
    const nextNo = Math.max(0, ...state.versions.filter((v) => v.customerId === trial.customerId).map((v) => v.version)) + 1;
    dispatch({
      type: "ADD_VERSION",
      version: {
        id: uid("v"),
        customerId: trial.customerId,
        trialId: trial.id,
        version: nextNo,
        reason: form.reason.trim(),
        adjustment: form.adjustment.trim(),
        gains: Object.fromEntries(BANDS.map((b) => [b, Number(form.gains[b]) || 0])),
        superseded: false,
      },
    });
    setVersionErrors((p) => ({ ...p, [trial.id]: "" }));
    setNotice(`已为客户新建 V${nextNo} 参数版本，旧参数保留在历史版本中`);
  };

  /* ---------- 改期 ---------- */
  const [reschedForm, setReschedForm] = useState({ appointmentId: "", date: DATES[0], slot: SLOTS[0] });

  const submitReschedule = () => {
    const old = state.appointments.find((a) => a.id === reschedForm.appointmentId);
    if (!old) return;
    const conflict = deviceBusy(state.appointments, old.deviceId, reschedForm.date, reschedForm.slot, old.id);
    const customer = customerOf(old.customerId);
    dispatch({
      type: "RESCHEDULE",
      appointmentId: old.id,
      newAppointment: conflict
        ? undefined
        : { ...old, id: uid("a"), date: reschedForm.date, slot: reschedForm.slot, status: "已预约" },
      conflict: conflict
        ? {
            id: uid("cf"),
            customer: customer?.name ?? old.customerId,
            device: deviceName(old.deviceId),
            slot: `${reschedForm.date} ${reschedForm.slot}`,
            original: `${old.date} ${old.slot}`,
          }
        : undefined,
    });
    setNotice(
      conflict
        ? `已先释放 ${deviceName(old.deviceId)} 原时段；新时段被占用，冲突已记录（客户/设备/时段/原值）`
        : `已释放原设备时段，并改期到 ${reschedForm.date} ${reschedForm.slot}`
    );
    setReschedForm({ appointmentId: "", date: DATES[0], slot: SLOTS[0] });
  };

  /* ---------- 耳模返工 ---------- */
  const [reworkingId, setReworkingId] = useState("");
  const [reworkReason, setReworkReason] = useState("");

  /* ============================= 渲染 ============================= */

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">{project.id} · port {project.port}</p>
          <h1>{project.title}</h1>
          <p className="subtitle">{project.subtitle}</p>
        </div>
        <div className="stack-card">
          <span>技术栈</span>
          <strong>{project.stack}</strong>
          <span>闭环规则</span>
          <strong>设备不重叠 · 红肿/未消毒仅待复核 · 满意度&lt;{SATISFACTION_MIN} 强制新版本</strong>
        </div>
      </section>

      <section className="metrics-grid">
        {metrics.map((m, i) => (
          <article className="metric-card" key={m.label}>
            <span>{m.label}</span>
            <strong>{m.value}</strong>
            <i className={["status-ok", "status-watch", "status-danger", "status-ok"][i % 4]} />
          </article>
        ))}
      </section>

      {notice && (
        <div className="notice" onClick={() => setNotice("")}>
          {notice} <em>（点击关闭）</em>
        </div>
      )}

      {/* ---------- 预约 + 改期 ---------- */}
      <section className="workspace">
        <aside className="panel narrow">
          <h2>新建复调预约</h2>
          <div className="form-stack">
            <label>
              <span>客户（含左右耳记录）</span>
              <select
                value={apptForm.customerId}
                onChange={(e) => {
                  const cid = e.target.value;
                  const first = state.earmolds.find((em) => em.customerId === cid);
                  setApptForm((f) => ({ ...f, customerId: cid, earmoldId: first?.id ?? "" }));
                }}
              >
                {state.customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}（左{c.ears.left.pta}dB/{c.ears.left.canal} · 右{c.ears.right.pta}dB/{c.ears.right.canal}）
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>耳模</span>
              <select value={apptForm.earmoldId} onChange={(e) => setApptForm((f) => ({ ...f, earmoldId: e.target.value }))}>
                {customerEarmolds.map((e) => (
                  <option key={e.id} value={e.id}>
                    {sideLabel(e.side)} · {e.status} · {e.disinfected ? "已消毒" : "未消毒"}
                  </option>
                ))}
                {customerEarmolds.length === 0 && <option value="">该客户暂无耳模</option>}
              </select>
            </label>
            <label>
              <span>试听机</span>
              <select value={apptForm.deviceId} onChange={(e) => setApptForm((f) => ({ ...f, deviceId: e.target.value }))}>
                {state.devices.map((d) => (
                  <option key={d.id} value={d.id}>{d.name} · {d.model}</option>
                ))}
              </select>
            </label>
            <label>
              <span>日期</span>
              <select value={apptForm.date} onChange={(e) => setApptForm((f) => ({ ...f, date: e.target.value }))}>
                {DATES.map((d) => <option key={d}>{d}</option>)}
              </select>
            </label>
            <label>
              <span>时段</span>
              <select value={apptForm.slot} onChange={(e) => setApptForm((f) => ({ ...f, slot: e.target.value }))}>
                {SLOTS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            {apptError && <p className="error-text">{apptError}</p>}
            <button className="primary-action" onClick={submitAppointment}>提交预约</button>
          </div>

          <h2>改期（先释放设备）</h2>
          <div className="form-stack">
            <label>
              <span>选择预约</span>
              <select value={reschedForm.appointmentId} onChange={(e) => setReschedForm((f) => ({ ...f, appointmentId: e.target.value }))}>
                <option value="">请选择</option>
                {activeAppts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {customerOf(a.customerId)?.name} · {deviceName(a.deviceId)} · {a.date} {a.slot}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>新日期</span>
              <select value={reschedForm.date} onChange={(e) => setReschedForm((f) => ({ ...f, date: e.target.value }))}>
                {DATES.map((d) => <option key={d}>{d}</option>)}
              </select>
            </label>
            <label>
              <span>新时段</span>
              <select value={reschedForm.slot} onChange={(e) => setReschedForm((f) => ({ ...f, slot: e.target.value }))}>
                {SLOTS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            <button onClick={submitReschedule} disabled={!reschedForm.appointmentId}>确认改期</button>
          </div>
        </aside>

        <section className="panel">
          <div className="section-heading">
            <div>
              <p>预约看板</p>
              <h2>预约与设备占用</h2>
            </div>
            <button onClick={() => { dispatch({ type: "RESET" }); setNotice("已重置为演示数据"); }}>重置数据</button>
          </div>
          <div className="record-list">
            {state.appointments.map((a) => {
              const c = customerOf(a.customerId);
              const e = earmoldOf(a.earmoldId);
              return (
                <article key={a.id} className={`record-card ${a.status === "已改期" ? "dimmed" : ""}`}>
                  <div className="record-index">{a.date.slice(5)}</div>
                  <div>
                    <h3>
                      {c?.name} · {deviceName(a.deviceId)} · {a.slot} {apptBadge(a.status)}
                    </h3>
                    <p>
                      耳模{sideLabel(e?.side ?? "left")}（{e?.disinfected ? "已消毒" : "未消毒"} · {e?.status}） ·
                      左耳 {c?.ears.left.pta}dB/{c?.ears.left.canal} · 右耳 {c?.ears.right.pta}dB/{c?.ears.right.canal}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>

          {state.conflicts.length > 0 && (
            <>
              <h2 className="sub-heading">改期冲突（客户 / 设备 / 时段 / 原值）</h2>
              <div className="record-list">
                {state.conflicts.map((cf) => (
                  <article key={cf.id} className="record-card conflict-card">
                    <div className="record-index conflict-index">冲</div>
                    <div>
                      <h3>{cf.customer} · {cf.device}</h3>
                      <p>申请时段：{cf.slot} · 原值：{cf.original}（原设备时段已释放，请另选时段）</p>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      </section>

      {/* ---------- 试听记录 ---------- */}
      <section className="workspace">
        <section className="panel">
          <div className="section-heading">
            <div>
              <p>试听记录</p>
              <h2>录入分频增益与满意度</h2>
            </div>
          </div>
          <div className="form-stack">
            <label>
              <span>选择预约</span>
              <select value={trialForm.appointmentId} onChange={(e) => setTrialForm((f) => ({ ...f, appointmentId: e.target.value }))}>
                <option value="">请选择已预约记录</option>
                {activeAppts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {customerOf(a.customerId)?.name} · {deviceName(a.deviceId)} · {a.date} {a.slot}
                  </option>
                ))}
              </select>
            </label>
            {trialAppt && (
              <div className={blockers.length ? "alert alert-warn" : "alert alert-ok"}>
                {blockers.length
                  ? `阻断：${blockers.join("；")} —— 不得生成试听结果，提交后仅转入待复核`
                  : "耳道与耳模状态正常，可生成试听结果"}
              </div>
            )}
            <div className="gain-grid">
              {BANDS.map((b) => (
                <label key={b}>
                  <span>{b} 增益(dB)</span>
                  <input
                    type="number"
                    value={gains[b]}
                    onChange={(e) => setGains((g) => ({ ...g, [b]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
            <label>
              <span>满意度（0-100，低于 {SATISFACTION_MIN} 须新建版本）</span>
              <input
                type="number"
                min={0}
                max={100}
                value={trialForm.satisfaction}
                onChange={(e) => setTrialForm((f) => ({ ...f, satisfaction: e.target.value }))}
              />
            </label>
            <button className="primary-action" onClick={submitTrial} disabled={!trialForm.appointmentId}>
              提交试听记录
            </button>
          </div>
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <p>试听结果</p>
              <h2>结果与待复核</h2>
            </div>
          </div>
          <div className="record-list">
            {state.trials.length === 0 && <p className="empty-text">暂无试听记录</p>}
            {state.trials.map((t) => {
              const c = customerOf(t.customerId);
              return (
                <article key={t.id} className="record-card">
                  <div className="record-index">{t.satisfaction}</div>
                  <div>
                    <h3>
                      {c?.name} · 满意度 {t.satisfaction}{" "}
                      {t.status === "已生成" ? <Badge tone="ok">已生成</Badge> : <Badge tone="warn">待复核</Badge>}
                      {t.status === "已生成" && t.satisfaction < SATISFACTION_MIN && <Badge tone="danger">需调整并建版本</Badge>}
                    </h3>
                    <p>分频增益：{BANDS.map((b) => `${b} ${t.gains[b]}dB`).join(" · ")}</p>
                    {t.blockReason && <p className="error-text">阻断原因：{t.blockReason}（仅转入待复核，未生成结果）</p>}
                  </div>
                </article>
              );
            })}
          </div>

          {trialsNeedingVersion.length > 0 && (
            <>
              <h2 className="sub-heading">满意度低于 {SATISFACTION_MIN}：填写调整并新建带原因版本</h2>
              {trialsNeedingVersion.map((t) => {
                const form = versionFormOf(t);
                const setForm = (patch: Partial<typeof form>) =>
                  setVersionForms((p) => ({ ...p, [t.id]: { ...form, ...patch } }));
                return (
                  <div key={t.id} className="version-form">
                    <p>
                      {customerOf(t.customerId)?.name} · 满意度 {t.satisfaction} · 当前增益{" "}
                      {BANDS.map((b) => `${b} ${t.gains[b]}`).join("/")}
                    </p>
                    <div className="gain-grid">
                      {BANDS.map((b) => (
                        <label key={b}>
                          <span>新 {b}(dB)</span>
                          <input
                            type="number"
                            value={form.gains[b]}
                            onChange={(e) => setForm({ gains: { ...form.gains, [b]: e.target.value } })}
                          />
                        </label>
                      ))}
                    </div>
                    <label>
                      <span>调整说明（必填）</span>
                      <input
                        placeholder="例如：2kHz 以上增益 +4dB，压缩比下调"
                        value={form.adjustment}
                        onChange={(e) => setForm({ adjustment: e.target.value })}
                      />
                    </label>
                    <label>
                      <span>版本原因（必填）</span>
                      <input
                        placeholder="例如：满意度 72，反馈人声发闷"
                        value={form.reason}
                        onChange={(e) => setForm({ reason: e.target.value })}
                      />
                    </label>
                    {versionErrors[t.id] && <p className="error-text">{versionErrors[t.id]}</p>}
                    <button className="primary-action" onClick={() => submitVersion(t)}>新建版本（旧参数保留）</button>
                  </div>
                );
              })}
            </>
          )}
        </section>
      </section>

      {/* ---------- 耳模返工 + 版本链 ---------- */}
      <section className="workspace">
        <section className="panel">
          <div className="section-heading">
            <div>
              <p>耳模返工闭环</p>
              <h2>耳模状态</h2>
            </div>
          </div>
          <div className="record-list">
            {state.earmolds.map((e) => {
              const c = customerOf(e.customerId);
              return (
                <article key={e.id} className="record-card">
                  <div className="record-index">{sideLabel(e.side).slice(0, 1)}</div>
                  <div>
                    <h3>
                      {c?.name} · {sideLabel(e.side)}耳模{" "}
                      {e.status === "可用" ? <Badge tone="ok">可用</Badge> : <Badge tone="danger">返工中</Badge>}
                      {e.disinfected ? <Badge tone="ok">已消毒</Badge> : <Badge tone="warn">未消毒</Badge>}
                    </h3>
                    {e.reworkReason && <p>返工原因:{e.reworkReason}</p>}
                    <div className="row-actions">
                      {e.status === "可用" && (
                        <button onClick={() => { setReworkingId(e.id); setReworkReason(""); }}>发起返工</button>
                      )}
                      {e.status === "返工中" && (
                        <button onClick={() => dispatch({ type: "EARMOLD_STATUS", earmoldId: e.id, status: "可用", disinfected: false })}>
                          完成返工（需重新消毒）
                        </button>
                      )}
                      {e.status === "可用" && !e.disinfected && (
                        <button onClick={() => dispatch({ type: "EARMOLD_STATUS", earmoldId: e.id, status: "可用", disinfected: true })}>
                          标记已消毒
                        </button>
                      )}
                    </div>
                    {reworkingId === e.id && (
                      <div className="row-actions">
                        <input
                          placeholder="返工原因，如：佩戴胀痛 / 漏音"
                          value={reworkReason}
                          onChange={(ev) => setReworkReason(ev.target.value)}
                        />
                        <button
                          className="primary-action"
                          onClick={() => {
                            if (!reworkReason.trim()) return;
                            dispatch({ type: "EARMOLD_STATUS", earmoldId: e.id, status: "返工中", reason: reworkReason.trim() });
                            setReworkingId("");
                            setNotice(`耳模已转入返工，返工期间不可预约试听`);
                          }}
                        >
                          确认返工
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <p>参数版本链</p>
              <h2>分频增益版本（旧参数保留）</h2>
            </div>
          </div>
          {state.customers.map((c) => {
            const vs = state.versions.filter((v) => v.customerId === c.id).sort((a, b) => b.version - a.version);
            if (vs.length === 0) return null;
            return (
              <div key={c.id} className="version-chain">
                <h3 className="chain-title">{c.name} <span>{c.tag}</span></h3>
                {vs.map((v) => (
                  <article key={v.id} className={`record-card ${v.superseded ? "dimmed" : ""}`}>
                    <div className="record-index">V{v.version}</div>
                    <div>
                      <h3>
                        版本 {v.version} {v.superseded ? <Badge tone="muted">历史（参数保留）</Badge> : <Badge tone="ok">当前</Badge>}
                      </h3>
                      <p>原因：{v.reason} · 调整:{v.adjustment}</p>
                      <p>增益：{BANDS.map((b) => `${b} ${v.gains[b]}dB`).join(" · ")}</p>
                    </div>
                  </article>
                ))}
              </div>
            );
          })}
        </section>
      </section>
    </main>
  );
}

export default App;
