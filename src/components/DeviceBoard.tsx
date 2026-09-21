import { useMemo, useState } from "react";
import { Slot } from "../types";
import {
  customerName,
  deviceLabel,
  fmtSlot,
  occupyingAppointments,
  overlap,
} from "../domain";
import { AppState } from "../types";

export function DeviceBoard({ state }: { state: AppState }) {
  const occ = useMemo(() => occupyingAppointments(state), [state]);
  const allStarts = occ.map((a) => a.slot.start).sort();
  const [probe, setProbe] = useState<Slot>({ start: "", end: "" });

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p>试听机借用占用</p>
          <h2>设备时段互斥视图</h2>
        </div>
      </div>

      <div className="probe-row">
        <input
          type="datetime-local"
          value={probe.start}
          onChange={(e) => setProbe((p) => ({ ...p, start: e.target.value }))}
          aria-label="探测开始"
        />
        <span>至</span>
        <input
          type="datetime-local"
          value={probe.end}
          onChange={(e) => setProbe((p) => ({ ...p, end: e.target.value }))}
          aria-label="探测结束"
        />
        <span className="muted-text">
          {probe.start && probe.end
            ? (() => {
                const hit = occ.filter(
                  (a) => overlap(a.slot, probe)
                );
                return hit.length === 0
                  ? "该时段两台设备均空闲（按设备看下列无重叠）"
                  : `该时段占用：${hit
                      .map((a) => `${a.id}(${deviceLabel(state, a.deviceId)})`)
                      .join("、")}`;
              })()
            : "选择时段可探测占用"}
        </span>
      </div>

      <div className="device-grid">
        {state.devices.map((d) => {
          const list = occ
            .filter((a) => a.deviceId === d.id)
            .sort((a, b) => a.slot.start.localeCompare(b.slot.start));
          return (
            <article key={d.id} className="device-col">
              <header>
                <h3>{deviceLabel(state, d.id)}</h3>
                <span className="tag muted">{d.code}</span>
              </header>
              {list.length === 0 && <p className="muted-text">无占用，可借用</p>}
              <ol className="timeline">
                {list.map((a) => (
                  <li
                    key={a.id}
                    className={`tl-item ${
                      a.status === "pending_review"
                        ? "danger"
                        : a.status === "completed"
                        ? "done"
                        : "live"
                    }`}
                  >
                    <div className="tl-time">{fmtSlot(a.slot)}</div>
                    <div className="tl-who">
                      <strong>{a.id}</strong> {customerName(state, a.customerId)}
                      <span className="tag muted">
                        {a.status === "pending_review"
                          ? "待复核占用"
                          : a.status === "completed"
                          ? "试听完成"
                          : "已预约占用"}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            </article>
          );
        })}
      </div>
      <p className="foot-note">
        占用口径：已预约 / 待复核 / 已完成试听均借出设备；改期中（已释放）与已改期旧单不占位。
        {allStarts.length > 0 && ` 数据覆盖自 ${fmtSlot({ start: allStarts[0], end: "" })} 起的预约。`}
      </p>
    </section>
  );
}
