import { useState } from "react";
import { SIDE_LABEL } from "../types";
import { customerName, moldById } from "../domain";
import { AppState } from "../types";
import { StoreDispatch } from "../store";

export function ReworkPanel({
  state,
  dispatch,
}: {
  state: AppState;
  dispatch: StoreDispatch;
}) {
  const [note, setNote] = useState<Record<string, string>>({});
  const [sterilize, setSterilize] = useState<Record<string, boolean>>({});
  const open = state.reworks.filter((r) => r.status === "open");
  const done = state.reworks.filter((r) => r.status === "done");

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p>耳模返工闭环</p>
          <h2>待返工 {open.length} · 已闭环 {done.length}</h2>
        </div>
      </div>

      {open.length === 0 && <p className="muted-text">当前无开放返工单。</p>}

      <div className="rework-list">
        {open.map((r) => {
          const mold = moldById(state, r.moldId);
          const needSterilize = r.reason === "耳模未消毒";
          return (
            <article key={r.id} className="rework-card">
              <div className="rework-main">
                <div className="appt-id">
                  <h3>{r.id}</h3>
                  <span className="tag danger">{r.reason}</span>
                  <span className="tag muted">{SIDE_LABEL[r.side]}</span>
                </div>
                <p>
                  {customerName(state, r.customerId)} · {r.moldId} · 来源{" "}
                  {r.sourceAppointmentId}
                </p>
                <div className="rework-form">
                  <input
                    placeholder="返工/消毒处理记录（可选）"
                    value={note[r.id] ?? ""}
                    onChange={(e) =>
                      setNote((m) => ({ ...m, [r.id]: e.target.value }))
                    }
                  />
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={sterilize[r.id] ?? needSterilize}
                      onChange={(e) =>
                        setSterilize((m) => ({ ...m, [r.id]: e.target.checked }))
                      }
                    />
                    完成时耳模已消毒
                  </label>
                  <button
                    className="primary-action small"
                    onClick={() =>
                      dispatch({
                        type: "COMPLETE_REWORK",
                        reworkId: r.id,
                        note: note[r.id] ?? "",
                        sterilize: sterilize[r.id] ?? needSterilize,
                      })
                    }
                  >
                    返工完成
                  </button>
                </div>
              </div>
              <div className="rework-side-note">
                {mold && (
                  <>
                    <span className={`tag ${mold.sterilized ? "ok" : "danger"}`}>
                      当前{mold.sterilized ? "已消毒" : "未消毒"}
                    </span>
                    <p>返工期间耳模为「返工中」，完成后恢复在用并回写待复核单。</p>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {done.length > 0 && (
        <details className="done-list">
          <summary>已闭环返工单（{done.length}）</summary>
          <ul>
            {done.map((r) => (
              <li key={r.id}>
                {r.id} · {customerName(state, r.customerId)} · {SIDE_LABEL[r.side]} ·{" "}
                {r.reason}
                {r.note ? ` · ${r.note}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
