export function LogStream({ logs }: { logs: import("../types").AppState["logs"] }) {
  const toneText: Record<string, string> = {
    info: "信息",
    ok: "成功",
    warn: "注意",
    danger: "拦截",
  };
  return (
    <section className="panel log-panel">
      <div className="section-heading">
        <div>
          <p>操作轨迹</p>
          <h2>闭环流水（最近 {logs.length} 条）</h2>
        </div>
      </div>
      {logs.length === 0 && <p className="muted-text">暂无操作</p>}
      <ul className="log-list">
        {logs.map((l) => (
          <li key={l.id} className={`log-${l.tone}`}>
            <span className="log-time">{new Date(l.at).toLocaleString("zh-CN")}</span>
            <span className={`tag ${l.tone === "info" ? "muted" : l.tone}`}>
              {toneText[l.tone]}
            </span>
            <span>{l.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
