import { AppState } from "../types";
import {
  activeConflicts,
  customerName,
  deviceLabel,
  fmtSlot,
} from "../domain";
import { StoreDispatch } from "../store";

export function ConflictPanel({
  state,
  dispatch,
}: {
  state: AppState;
  dispatch: StoreDispatch;
}) {
  const list = activeConflicts(state);

  return (
    <section className={`panel conflict-panel ${list.length ? "has-conflict" : ""}`}>
      <div className="section-heading">
        <div>
          <p>冲突清单</p>
          <h2>设备占用冲突 {list.length > 0 && <em className="danger-text">{list.length}</em>}</h2>
        </div>
        {list.length > 0 && (
          <button className="ghost small" onClick={() => dispatch({ type: "CLEAR_CONFLICTS" })}>
            全部标记已处理
          </button>
        )}
      </div>

      {list.length === 0 ? (
        <p className="muted-text">
          暂无未处理冲突。预约/改期被拒的同一设备时段重叠会记录在此，包含客户、设备、时段和原值。
        </p>
      ) : (
        <div className="table-wrap">
          <table className="conflict-table">
            <thead>
              <tr>
                <th>编号</th>
                <th>动作</th>
                <th>发起客户</th>
                <th>试听机</th>
                <th>申请时段（未生效）</th>
                <th>被占用客户 / 预约</th>
                <th>占用时段</th>
                <th>原值（改期）</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td>{c.id}</td>
                  <td>
                    <span className="tag warn">{c.action === "book" ? "新预约" : "改期"}</span>
                  </td>
                  <td>{customerName(state, c.requestedCustomerId)}</td>
                  <td>{deviceLabel(state, c.deviceId)}</td>
                  <td className="danger-text">{fmtSlot(c.requestedSlot)}</td>
                  <td>
                    {customerName(state, c.heldCustomerId)}
                    <br />
                    <span className="muted-text">{c.heldAppointmentId}</span>
                  </td>
                  <td>{fmtSlot(c.heldSlot)}</td>
                  <td>{c.originalSlot ? fmtSlot(c.originalSlot) : "—"}</td>
                  <td>
                    <button
                      className="ghost small"
                      onClick={() =>
                        dispatch({ type: "DISMISS_CONFLICT", conflictId: c.id })
                      }
                    >
                      处理掉
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
