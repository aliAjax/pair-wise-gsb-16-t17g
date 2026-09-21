import { useMemo, useState } from "react";
import "./styles.css";
import { useStore } from "./store";
import { Appointment } from "./types";
import { statusText } from "./domain";
import { BookingForm } from "./components/BookingForm";
import { AppointmentCard } from "./components/AppointmentCard";
import { TrialModal } from "./components/TrialModal";
import { RescheduleModal } from "./components/RescheduleModal";
import { ReworkPanel } from "./components/ReworkPanel";
import { DeviceBoard } from "./components/DeviceBoard";
import { ConflictPanel } from "./components/ConflictPanel";
import { AuditPanel } from "./components/AuditPanel";
import { Metrics } from "./components/Metrics";
import { LogStream } from "./components/LogStream";

const FILTERS = [
  { key: "active", label: "进行中（预约/待复核）" },
  { key: "released", label: "改期中" },
  { key: "completed", label: "已完成试听" },
  { key: "rescheduled", label: "已改期旧单" },
  { key: "all", label: "全部" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

export default function App() {
  const { state, dispatch } = useStore();
  const [filter, setFilter] = useState<FilterKey>("active");
  const [trialTarget, setTrialTarget] = useState<Appointment | null>(null);
  const [reschedTarget, setReschedTarget] = useState<Appointment | null>(null);

  // 弹窗目标以最新 state 为准（改期确认后旧单状态已变化）
  const trialAppt = trialTarget
    ? state.appointments.find((a) => a.id === trialTarget.id) ?? null
    : null;
  const reschedAppt = reschedTarget
    ? state.appointments.find((a) => a.id === reschedTarget.id) ?? null
    : null;

  const list = useMemo(() => {
    const sorted = [...state.appointments].sort((a, b) =>
      b.slot.start.localeCompare(a.slot.start)
    );
    switch (filter) {
      case "active":
        return sorted.filter(
          (a) => a.status === "booked" || a.status === "pending_review"
        );
      case "released":
        return sorted.filter((a) => a.status === "released");
      case "completed":
        return sorted.filter((a) => a.status === "completed");
      case "rescheduled":
        return sorted.filter((a) => a.status === "rescheduled");
      default:
        return sorted;
    }
  }, [state.appointments, filter]);

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">hxwl-01 · port 5101</p>
          <h1>听力验配复调闭环</h1>
          <p className="subtitle">
            复调预约（客户 · 左右耳 · 试听机 · 时段）→ 设备借用互斥 → 试听分频增益记录 →
            满意度版本链（旧参数保留）→ 耳道红肿/未消毒转待复核与耳模返工 → 改期先释放设备，
            刷新后预约、耳模、试听、版本链一致。
          </p>
        </div>
        <div className="stack-card">
          <span>闭环状态</span>
          <strong>
            {state.appointments.length} 预约 · {state.trials.length} 试听 ·{" "}
            {state.versions.length} 参数版本
          </strong>
          <span className="muted-text">数据持久化于浏览器 localStorage</span>
        </div>
      </section>

      {state.notice && (
        <div className={`notice ${state.notice.kind}`} onClick={() => dispatch({ type: "CLEAR_NOTICE" })}>
          {state.notice.kind === "ok" ? "✓ " : "⚠ "}
          {state.notice.text}
        </div>
      )}

      <Metrics state={state} />

      <BookingForm state={state} dispatch={dispatch} />

      <DeviceBoard state={state} />

      <section className="panel records">
        <div className="section-heading">
          <div>
            <p>预约档案</p>
            <h2>复调 / 初配预约与试听记录</h2>
          </div>
        </div>
        <div className="chips muted filter-chips">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={filter === f.key ? "chip-active" : ""}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="record-list">
          {list.length === 0 && (
            <p className="muted-text">
              该分类暂无预约（{FILTERS.find((f) => f.key === filter)?.label}）。
            </p>
          )}
          {list.map((a) => (
            <AppointmentCard
              key={a.id}
              state={state}
              appointment={a}
              onTrial={setTrialTarget}
              onReschedule={(appt) => {
                dispatch({ type: "RESCHEDULE_START", appointmentId: appt.id });
                setReschedTarget(appt);
              }}
              onContinueReschedule={(appt) => setReschedTarget(appt)}
            />
          ))}
        </div>
        <p className="foot-note">
          状态图例：{(["booked", "pending_review", "completed", "released", "rescheduled"] as const).map(
            (s) => statusText(s)
          ).join(" / ")}
        </p>
      </section>

      <ReworkPanel state={state} dispatch={dispatch} />

      <ConflictPanel state={state} dispatch={dispatch} />

      <AuditPanel state={state} dispatch={dispatch} />

      <LogStream logs={state.logs} />

      {trialAppt && (
        <TrialModal
          state={state}
          dispatch={dispatch}
          appointment={trialAppt}
          onClose={() => setTrialTarget(null)}
        />
      )}
      {reschedAppt && reschedAppt.status === "released" && (
        <RescheduleModal
          state={state}
          dispatch={dispatch}
          appointment={reschedAppt}
          onClose={() => setReschedTarget(null)}
        />
      )}
    </main>
  );
}
