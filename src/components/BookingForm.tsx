import { useEffect, useMemo, useState } from "react";
import { AppState, BookEarInput, Side, SIDE_LABEL } from "../types";
import {
  deviceConflicts,
  deviceLabel,
  customerName,
  fmtSlot,
  nowLocal,
} from "../domain";

import { StoreDispatch } from "../store";

type Dispatch = StoreDispatch;

const SIDES: Side[] = ["L", "R"];

export function BookingForm({
  state,
  dispatch,
}: {
  state: AppState;
  dispatch: Dispatch;
}) {
  const [customerId, setCustomerId] = useState("new");
  const [name, setName] = useState("");
  const [tag, setTag] = useState("复调");
  const [deviceId, setDeviceId] = useState(state.devices[0]?.id ?? "");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [picked, setPicked] = useState<Set<Side>>(new Set(["L", "R"]));
  const [moldChoice, setMoldChoice] = useState<Record<Side, string>>({
    L: "new",
    R: "new",
  });

  const preview = start && end ? { start, end } : null;
  const liveClashes = useMemo(
    () => (preview && deviceId ? deviceConflicts(state, deviceId, preview) : []),
    [state, deviceId, preview]
  );

  const customerMolds =
    customerId !== "new"
      ? state.molds.filter(
          (m) => m.customerId === customerId && m.status !== "archived"
        )
      : [];

  // 切换客户时，原客户的耳模选择不得残留
  useEffect(() => {
    setMoldChoice({ L: "new", R: "new" });
  }, [customerId]);

  function toggleSide(side: Side) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(side)) next.delete(side);
      else next.add(side);
      return next;
    });
  }

  function submit() {
    const ears: BookEarInput[] = [...picked]
      .sort((a, b) => a.localeCompare(b))
      .map((side) => ({ side, moldId: moldChoice[side] ?? "new" }));
    dispatch({
      type: "BOOK",
      input: {
        customerId,
        newCustomerName: name,
        newCustomerTag: tag,
        deviceId,
        start,
        end,
        ears,
      },
    });
    setName("");
    setStart("");
    setEnd("");
  }

  function fillSoon() {
    const s = nowLocal();
    const [d] = s.split("T");
    setStart(`${d}T10:00`);
    setEnd(`${d}T11:00`);
  }

  return (
    <section className="panel form-panel">
      <div className="section-heading">
        <div>
          <p>复调预约</p>
          <h2>新建试听预约 · 设备借用</h2>
        </div>
        <button className="ghost" type="button" onClick={fillSoon}>
          填入今日 10:00
        </button>
      </div>

      <div className="form-grid">
        <label>
          <span>客户</span>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="new">＋ 新客户建档</option>
            {state.customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id} {c.name}（{c.tag}）
              </option>
            ))}
          </select>
        </label>

        {customerId === "new" ? (
          <>
            <label>
              <span>客户姓名</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="如：周先生"
              />
            </label>
            <label>
              <span>分类</span>
              <select value={tag} onChange={(e) => setTag(e.target.value)}>
                {["初配", "复调", "儿童", "老人", "复诊"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <div className="hint-box">
            复调沿用历史 case：新预约自动挂到「{customerName(state, customerId)}」最近的
            case 链，试听与分频参数版本可追溯。
          </div>
        )}

        <label>
          <span>试听机</span>
          <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
            {state.devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.id} · {d.code} · {d.model}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>开始时间</span>
          <input
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label>
          <span>结束时间</span>
          <input
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
      </div>

      <fieldset className="ear-pick">
        <legend>左右耳记录与耳模绑定</legend>
        <div className="ear-row">
          {SIDES.map((side) => {
            const on = picked.has(side);
            const sideMolds = customerMolds.filter((m) => m.side === side);
            return (
              <div key={side} className={`ear-card ${on ? "on" : ""}`}>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleSide(side)}
                  />
                  <strong>{SIDE_LABEL[side]}</strong>
                </label>
                {on && (
                  <select
                    value={moldChoice[side]}
                    onChange={(e) =>
                      setMoldChoice((prev) => ({ ...prev, [side]: e.target.value }))
                    }
                  >
                    <option value="new">新借用耳模（自动建档，默认已消毒）</option>
                    {sideMolds.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.id} · {m.status === "rework" ? "返工中" : "在用"} ·{" "}
                        {m.sterilized ? "已消毒" : "未消毒"}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      </fieldset>

      {liveClashes.length > 0 && (
        <div className="inline-conflict">
          ⚠ 当前选择将与占用冲突：
          {liveClashes.map((a) => (
            <span key={a.id} className="tag danger">
              {a.id} {customerName(state, a.customerId)} ·{" "}
              {deviceLabel(state, a.deviceId)} · {fmtSlot(a.slot)}
            </span>
          ))}
          提交后不会创建预约，只会记录冲突。
        </div>
      )}

      <button className="primary-action wide" type="button" onClick={submit}>
        锁定设备时段并创建预约
      </button>
    </section>
  );
}
