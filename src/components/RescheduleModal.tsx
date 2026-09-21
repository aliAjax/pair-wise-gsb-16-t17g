import { useMemo, useState } from "react";
import { Appointment } from "../types";
import {
  customerName,
  deviceConflicts,
  deviceLabel,
  fmtSlot,
} from "../domain";
import { AppState } from "../types";
import { StoreDispatch } from "../store";

export function RescheduleModal({
  state,
  dispatch,
  appointment,
  onClose,
}: {
  state: AppState;
  dispatch: StoreDispatch;
  appointment: Appointment;
  onClose: () => void;
}) {
  const draft = state.drafts.find((d) => d.appointmentId === appointment.id);
  const [deviceId, setDeviceId] = useState(appointment.deviceId);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const slot = start && end ? { start, end } : null;
  const clashes = useMemo(
    () => (slot ? deviceConflicts(state, deviceId, slot) : []),
    [state, deviceId, slot]
  );

  if (!draft) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <p>改期 · 设备已释放</p>
            <h3>
              {appointment.id} · {customerName(state, appointment.customerId)}
            </h3>
          </div>
          <button className="ghost" onClick={onClose}>
            关闭
          </button>
        </div>

        <div className="released-banner">
          ✓ 第一步已完成：{deviceLabel(state, draft.deviceId)} 在
          <strong> {fmtSlot(draft.originalSlot)} </strong>
          的占用已释放，其他客户可借。现在确认新时段（旧原值保留在新单日志与冲突记录中）。
        </div>

        <div className="form-grid">
          <label>
            <span>新试听机</span>
            <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
              {state.devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.id} · {d.code} · {d.model}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>新开始时间</span>
            <input
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            <span>新结束时间</span>
            <input
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>

        <div className="orig-compare">
          <div>
            <span>原值（已释放）</span>
            <strong>{deviceLabel(state, draft.deviceId)}</strong>
            <p>{fmtSlot(draft.originalSlot)}</p>
          </div>
          <div className="arrow">→</div>
          <div>
            <span>新值（待确认）</span>
            <strong>{deviceLabel(state, deviceId)}</strong>
            <p>{slot ? fmtSlot(slot) : "尚未选择"}</p>
          </div>
        </div>

        {clashes.length > 0 && (
          <div className="inline-conflict">
            ⚠ 新时段与现有借用冲突，确认不会改期，仅记录冲突（含原值）：
            {clashes.map((a) => (
              <span key={a.id} className="tag danger">
                {a.id} {customerName(state, a.customerId)} ·{" "}
                {deviceLabel(state, a.deviceId)} · {fmtSlot(a.slot)}
              </span>
            ))}
          </div>
        )}

        <div className="modal-actions">
          <button
            className="ghost"
            onClick={() =>
              dispatch({ type: "RESCHEDULE_CANCEL", appointmentId: appointment.id })
            }
          >
            撤销改期，恢复原占用
          </button>
          <button
            className="primary-action"
            onClick={() =>
              dispatch({
                type: "RESCHEDULE_CONFIRM",
                appointmentId: appointment.id,
                deviceId,
                start,
                end,
              })
            }
          >
            确认改期并占用新时段
          </button>
        </div>
      </div>
    </div>
  );
}
