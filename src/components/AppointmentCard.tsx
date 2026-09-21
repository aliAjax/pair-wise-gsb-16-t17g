import { useState } from "react";
import { Appointment, SIDE_LABEL } from "../types";
import {
  caseAppointments,
  customerName,
  deviceLabel,
  fmtSlot,
  moldById,
  statusText,
  versionsForSide,
} from "../domain";
import { AppState } from "../types";

const STATUS_CLASS: Record<Appointment["status"], string> = {
  booked: "ok",
  pending_review: "danger",
  completed: "neutral",
  released: "warn",
  rescheduled: "muted",
};

function VersionChain({
  state,
  caseId,
  side,
}: {
  state: AppState;
  caseId: string;
  side: "L" | "R";
}) {
  const versions = versionsForSide(state, caseId, side);
  if (versions.length === 0) return <span className="muted-text">暂无试听参数</span>;
  return (
    <div className="version-chain">
      {versions.map((v) => (
        <div key={v.id} className={`version-node ${v.superseded ? "old" : "current"}`}>
          <div className="version-head">
            <strong>v{v.no}</strong>
            <span className={`tag ${v.superseded ? "muted" : "ok"}`}>
              {v.superseded ? "旧参数·保留" : "当前版本"}
            </span>
            <span
              className={`tag ${
                v.satisfaction < 80 ? "danger" : v.satisfaction < 90 ? "warn" : "ok"
              }`}
            >
              满意度 {v.satisfaction}
            </span>
          </div>
          <div className="gain-chips">
            {(["250", "500", "1K", "2K", "4K", "8K"] as const).map((b) => (
              <span key={b}>
                {b}
                <em>{v.gains[b]}</em>
              </span>
            ))}
          </div>
          {(v.adjustment || v.reason) && (
            <div className="version-notes">
              {v.adjustment && <p>调整：{v.adjustment}</p>}
              {v.reason && <p className="reason">新建原因：{v.reason}</p>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function AppointmentCard({
  state,
  appointment,
  onTrial,
  onReschedule,
  onContinueReschedule,
}: {
  state: AppState;
  appointment: Appointment;
  onTrial: (a: Appointment) => void;
  onReschedule: (a: Appointment) => void;
  onContinueReschedule: (a: Appointment) => void;
}) {
  const [open, setOpen] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const a = appointment;
  const chain = caseAppointments(state, a.caseId);
  const canTrial = a.status === "booked" || a.status === "pending_review";
  const canReschedule =
    a.status === "booked" || a.status === "pending_review" || a.status === "completed";
  const isReleased = a.status === "released";

  return (
    <article className={`appt-card status-${a.status}`}>
      <div className="appt-top">
        <div className="appt-id">
          <h3>{a.id}</h3>
          <span className={`tag ${STATUS_CLASS[a.status]}`}>{statusText(a.status)}</span>
          {a.createdFrom && <span className="tag muted">改期自 {a.createdFrom}</span>}
          <span className="tag muted">
            {a.caseId} · 第{a.seq}次
          </span>
        </div>
        <div className="appt-actions">
          {canTrial && (
            <button className="primary-action small" onClick={() => onTrial(a)}>
              登记试听
            </button>
          )}
          {canReschedule && (
            <button className="small" onClick={() => onReschedule(a)}>
              改期（先释放设备）
            </button>
          )}
          {isReleased && (
            <button className="primary-action small" onClick={() => onContinueReschedule(a)}>
              继续改期 · 确认新时段
            </button>
          )}
          <button className="ghost small" onClick={() => setOpen((v) => !v)}>
            {open ? "收起" : "参数链"}
          </button>
        </div>
      </div>

      <div className="appt-grid">
        <div>
          <span>客户</span>
          <strong>{customerName(state, a.customerId)}</strong>
        </div>
        <div>
          <span>试听机</span>
          <strong>{deviceLabel(state, a.deviceId)}</strong>
        </div>
        <div className="slot-cell">
          <span>借用时段</span>
          <strong>{fmtSlot(a.slot)}</strong>
        </div>
        <div>
          <span>双耳记录</span>
          <div className="ear-state-list">
            {a.ears.map((e) => {
              const m = moldById(state, e.moldId);
              return (
                <div key={e.side} className="ear-state">
                  <strong>{SIDE_LABEL[e.side]}</strong>
                  <span className="tag muted">{e.moldId}</span>
                  <span className={`tag ${m?.sterilized ? "ok" : "danger"}`}>
                    {m?.sterilized ? "已消毒" : "未消毒"}
                  </span>
                  <span
                    className={`tag ${
                      m?.status === "rework"
                        ? "danger"
                        : m?.status === "archived"
                        ? "muted"
                        : "ok"
                    }`}
                  >
                    {m?.status === "rework"
                      ? "返工中"
                      : m?.status === "archived"
                      ? "已归档"
                      : "在用"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {a.blocked && a.blocked.length > 0 && (
        <div className="blocked-box">
          <strong>待复核原因（未生成试听结果）：</strong>
          {a.blocked.map((b) => (
            <span key={b.side} className="tag danger">
              {SIDE_LABEL[b.side]}：{b.reasons.join("、")}
            </span>
          ))}
          <p>返工闭环后本单自动恢复「已预约」，可重新登记试听。</p>
        </div>
      )}

      {open && (
        <div className="chains-wrap">
          {a.ears.map((e) => (
            <div key={e.side} className="chain-col">
              <h4>{SIDE_LABEL[e.side]} 参数版本链</h4>
              <VersionChain state={state} caseId={a.caseId} side={e.side} />
            </div>
          ))}
          <div className="case-chain">
            <h4>case {a.caseId} 预约链（共 {chain.length} 次）</h4>
            <ol>
              {chain.map((c) => (
                <li key={c.id} className={c.id === a.id ? "self" : ""}>
                  {c.id} · {statusText(c.status)} · {deviceLabel(state, c.deviceId)} ·{" "}
                  {fmtSlot(c.slot)}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      <button className="link-btn" onClick={() => setShowLog((v) => !v)}>
        {showLog ? "隐藏操作轨迹" : "查看操作轨迹"}
      </button>
      {showLog && (
        <ul className="appt-log">
          {a.log.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
    </article>
  );
}
