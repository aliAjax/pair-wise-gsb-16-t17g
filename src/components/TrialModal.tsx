import { useMemo, useState } from "react";
import {
  Appointment,
  FREQ_BANDS,
  FREQ_UNIT,
  FreqBand,
  Gains,
  Side,
  SIDE_LABEL,
  TrialRow,
} from "../types";
import {
  customerName,
  defaultGains,
  deviceLabel,
  fmtSlot,
  latestVersion,
  moldById,
  SATISFACTION_THRESHOLD,
} from "../domain";
import { AppState } from "../types";
import { StoreDispatch } from "../store";

type RowState = {
  side: Side;
  canalRed: boolean;
  gains: Gains;
  satisfaction: number;
  adjustment: string;
  reason: string;
};

export function TrialModal({
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
  const initial = useMemo<RowState[]>(
    () =>
      appointment.ears.map((e) => {
        const parent = latestVersion(state, appointment.caseId, e.side);
        // 旧参数保留：默认带出当前版本参数作为调参起点
        const gains = parent ? { ...parent.gains } : defaultGains();
        return {
          side: e.side,
          canalRed: false,
          gains,
          satisfaction: parent ? parent.satisfaction : 82,
          adjustment: "",
          reason: "",
        };
      }),
    [state, appointment]
  );
  const [rows, setRows] = useState<RowState[]>(initial);

  function patch(side: Side, p: Partial<RowState>) {
    setRows((rs) => rs.map((r) => (r.side === side ? { ...r, ...p } : r)));
  }
  function patchGain(side: Side, band: FreqBand, value: number) {
    setRows((rs) =>
      rs.map((r) =>
        r.side === side ? { ...r, gains: { ...r.gains, [band]: value } } : r
      )
    );
  }

  function submit() {
    const payload: TrialRow[] = rows.map((r) => ({ ...r }));
    dispatch({ type: "SUBMIT_TRIAL", appointmentId: appointment.id, rows: payload });
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <p>试听记录</p>
            <h3>
              {appointment.id} · {customerName(state, appointment.customerId)} ·{" "}
              {deviceLabel(state, appointment.deviceId)}
            </h3>
            <span className="sub">{fmtSlot(appointment.slot)}</span>
          </div>
          <button className="ghost" onClick={onClose}>
            关闭
          </button>
        </div>

        <div className="safety-note">
          提交时硬性校验：任一侧<strong>耳道红肿</strong>或<strong>耳模未消毒</strong>
          ，均不会生成试听结果，预约整体转入<strong>待复核</strong>并自动开立耳模返工单。
        </div>

        {rows.map((row) => {
          const ear = appointment.ears.find((e) => e.side === row.side)!;
          const mold = moldById(state, ear.moldId);
          const parent = latestVersion(state, appointment.caseId, row.side);
          const low = row.satisfaction < SATISFACTION_THRESHOLD;
          return (
            <section key={row.side} className="trial-side">
              <header>
                <h4>{SIDE_LABEL[row.side]}</h4>
                <span className="tag">{mold?.id ?? "—"}</span>
                <span className={`tag ${mold?.sterilized ? "ok" : "danger"}`}>
                  {mold?.sterilized ? "耳模已消毒" : "耳模未消毒"}
                </span>
                {parent && (
                  <span className="tag muted">
                    基于 v{parent.no}（满意度{parent.satisfaction}）调参，旧参数保留
                  </span>
                )}
              </header>

              <label className="check-line">
                <input
                  type="checkbox"
                  checked={row.canalRed}
                  onChange={(e) => patch(row.side, { canalRed: e.target.checked })}
                />
                耳道红肿 / 不适（勾选后该次试听将被拦截）
              </label>

              <div className="gain-table-wrap">
                <table className="gain-table">
                  <thead>
                    <tr>
                      <th>分频增益(dB)</th>
                      {FREQ_BANDS.map((b) => (
                        <th key={b}>{FREQ_UNIT[b]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{SIDE_LABEL[row.side]}</td>
                      {FREQ_BANDS.map((b) => (
                        <td key={b}>
                          <input
                            type="number"
                            min={-20}
                            max={40}
                            value={row.gains[b]}
                            onChange={(e) =>
                              patchGain(row.side, b, Number(e.target.value))
                            }
                          />
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              <label className="sat-line">
                <span>
                  满意度 <strong className={low ? "danger-text" : "ok-text"}>{row.satisfaction}</strong>
                  /100{low && `（低于 ${SATISFACTION_THRESHOLD}，须填写调整并新建带原因版本）`}
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={row.satisfaction}
                  onChange={(e) =>
                    patch(row.side, { satisfaction: Number(e.target.value) })
                  }
                />
              </label>

              <label>
                <span>本次调整{low && <em className="req">（必填）</em>}</span>
                <input
                  value={row.adjustment}
                  onChange={(e) => patch(row.side, { adjustment: e.target.value })}
                  placeholder="如：2K/4K 各 +4dB，降低压缩比"
                />
              </label>
              <label>
                <span>新建版本原因{low && <em className="req">（必填）</em>}</span>
                <input
                  value={row.reason}
                  onChange={(e) => patch(row.side, { reason: e.target.value })}
                  placeholder={
                    low ? "如：v1 满意度76：多人环境言语清晰度不足" : "满意度≥80 可留空"
                  }
                />
              </label>
            </section>
          );
        })}

        <div className="modal-actions">
          <button className="ghost" onClick={onClose}>
            取消
          </button>
          <button className="primary-action" onClick={submit}>
            校验并提交试听
          </button>
        </div>
      </div>
    </div>
  );
}
