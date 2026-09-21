import { AppState } from "../types";
import {
  openReworks,
  activeConflicts,
  pendingAppointments,
  occupyingAppointments,
} from "../domain";

export function Metrics({ state }: { state: AppState }) {
  const pending = pendingAppointments(state).length;
  const rework = openReworks(state).length;
  const conflicts = activeConflicts(state).length;
  const occupied = occupyingAppointments(state).length;

  const cards = [
    { label: "设备占用中预约", value: occupied, tone: "ok", note: "含待复核/已完成试听" },
    { label: "待复核预约", value: pending, tone: pending ? "danger" : "ok", note: "耳道红肿/未消毒拦截" },
    { label: "开放耳模返工单", value: rework, tone: rework ? "warn" : "ok", note: "返工闭环后自动回写" },
    { label: "未处理设备冲突", value: conflicts, tone: conflicts ? "danger" : "ok", note: "同一设备时段重叠" },
  ];
  return (
    <section className="metrics-grid">
      {cards.map((c) => (
        <article key={c.label} className="metric-card">
          <span>{c.label}</span>
          <strong>{c.value}</strong>
          <i className={`status-${c.tone}`} />
          <p className="metric-note">{c.note}</p>
        </article>
      ))}
    </section>
  );
}
