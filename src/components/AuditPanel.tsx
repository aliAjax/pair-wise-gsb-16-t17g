import { useMemo } from "react";
import { AppState } from "../types";
import { checkConsistency, fmtSlot, statusText } from "../domain";
import { StoreDispatch } from "../store";

export function AuditPanel({
  state,
  dispatch,
}: {
  state: AppState;
  dispatch: StoreDispatch;
}) {
  const issues = useMemo(() => checkConsistency(state), [state]);
  const drafts = state.drafts;

  return (
    <section className="panel audit-panel">
      <div className="section-heading">
        <div>
          <p>刷新一致性</p>
          <h2>
            预约 · 耳模 · 试听 · 版本链{" "}
            <span className={`tag ${issues.length === 0 ? "ok" : "danger"}`}>
              {issues.length === 0 ? "校验通过" : `${issues.length} 项异常`}
            </span>
          </h2>
        </div>
        <div className="audit-actions">
          {state.lastRefreshAt && (
            <span className="muted-text">
              上次刷新 {new Date(state.lastRefreshAt).toLocaleTimeString("zh-CN")}
            </span>
          )}
          <button className="primary-action small" onClick={() => dispatch({ type: "REFRESH" })}>
            刷新并复核闭环
          </button>
          <button className="ghost small" onClick={() => dispatch({ type: "RESET_DEMO" })}>
            重置演示数据
          </button>
        </div>
      </div>

      {drafts.length > 0 && (
        <div className="draft-banner">
          {drafts.map((d) => (
            <p key={d.appointmentId}>
              改期进行中：{d.appointmentId} 的 {state.customers.find((c) => c.id === d.customerId)?.name}{" "}
              已释放 {d.deviceId}（原值 {fmtSlot(d.originalSlot)}），尚未确认新时段——刷新后此中间态保留。
            </p>
          ))}
        </div>
      )}

      {issues.length === 0 ? (
        <p className="muted-text ok-line">
          ✓ 设备占用无重叠；预约耳模引用完整；待复核单均有返工单；试听均挂版本且满意度规则满足；版本链连续、旧参数保留、每耳仅一个当前版本。
        </p>
      ) : (
        <ul className="issue-list">
          {issues.map((it, i) => (
            <li key={i} className={it.level}>
              <span className={`tag ${it.level}`}>{it.level === "error" ? "错误" : "警告"}</span>
              <code>{it.where}</code> {it.message}
            </li>
          ))}
        </ul>
      )}

      <details className="snapshot">
        <summary>查看当前内存/持久化数据快照（预约 {state.appointments.length} · 试听 {state.trials.length} · 版本 {state.versions.length}）</summary>
        <ul>
          {state.appointments.map((a) => (
            <li key={a.id}>
              {a.id} [{statusText(a.status)}] case={a.caseId} dev={a.deviceId}{" "}
              {fmtSlot(a.slot)} ears={a.ears.map((e) => e.side + ":" + e.moldId).join(",")}
              {a.trialId ? ` trial=${a.trialId}` : ""}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
