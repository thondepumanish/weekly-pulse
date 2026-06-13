import { useState, useEffect } from "react";
import { saveMonthData, loadMonthData } from "./firebase";

// ─── Design tokens ───────────────────────────────────────────────
const C = {
  bg: "#111009",
  surface: "#1A1712",
  card: "#201C17",
  border: "#2C2820",
  borderGold: "#C9A84C44",
  gold: "#C9A84C",
  goldDim: "#8A6E2E",
  text: "#F0E8D8",
  muted: "#6B5F4E",
  green: "#4CAF7A",
  red: "#E05C5C",
  amber: "#E8A838",
  blue: "#5B9BD5",
};

// ─── Helpers ─────────────────────────────────────────────────────
const fmtUSD = (n) => {
  if (!n && n !== 0) return "—";
  if (n >= 1000000) return `$${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
};
const pct = (a, b) => (b ? Math.min(parseFloat(((a / b) * 100).toFixed(1)), 999) : 0);
const safeNum = (v) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));

const getWeekLabel = () => {
  const now = new Date();
  const day = now.getDay();
  const mon = new Date(now); mon.setDate(now.getDate() - ((day + 6) % 7));
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const fmt = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(mon)} – ${fmt(sun)}`;
};

const getCurrentWeekOfMonth = () => {
  const d = new Date();
  return Math.min(Math.ceil(d.getDate() / 7), 4);
};

const statusColor = (pctVal) => {
  if (pctVal >= 100) return C.green;
  if (pctVal >= 70) return C.amber;
  return C.red;
};

// ─── Sub-components ──────────────────────────────────────────────

const ProgressBar = ({ value, max, color, height = 6 }) => {
  const fill = Math.min((value / max) * 100, 100);
  return (
    <div style={{ background: C.border, borderRadius: 99, height, overflow: "hidden", width: "100%" }}>
      <div style={{
        width: `${fill}%`, height: "100%",
        background: color || C.gold,
        borderRadius: 99,
        transition: "width 0.4s ease"
      }} />
    </div>
  );
};

const Tag = ({ color, children }) => (
  <span style={{
    background: `${color}22`, color, border: `1px solid ${color}44`,
    borderRadius: 4, fontSize: 10, padding: "2px 7px", fontWeight: 700,
    letterSpacing: 0.5, textTransform: "uppercase"
  }}>{children}</span>
);

const Input = ({ value, onChange, placeholder, type = "text", prefix, suffix }) => (
  <div style={{ display: "flex", alignItems: "center", background: C.border, borderRadius: 6, border: `1px solid ${value ? C.goldDim : "#3a3020"}`, overflow: "hidden" }}>
    {prefix && <span style={{ padding: "0 8px", color: value ? C.gold : C.muted, fontSize: 12, borderRight: `1px solid #3a3020`, whiteSpace: "nowrap" }}>{prefix}</span>}
    <input
      type={type} value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder || "tap to set"}
      style={{
        flex: 1, background: "transparent", border: "none", color: value ? C.gold : C.muted,
        padding: "7px 10px", fontSize: 13, outline: "none", width: "100%",
        fontFamily: "inherit", fontStyle: value ? "normal" : "italic"
      }}
    />
    {suffix && <span style={{ padding: "0 8px", color: value ? C.gold : C.muted, fontSize: 12, borderLeft: `1px solid #3a3020` }}>{suffix}</span>}
  </div>
);

const TA = ({ value, onChange, placeholder, rows = 3 }) => (
  <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
    style={{
      width: "100%", background: C.border, border: `1px solid #3a3020`, borderRadius: 6,
      color: C.text, padding: "8px 12px", fontSize: 13, outline: "none", resize: "vertical",
      fontFamily: "inherit", lineHeight: 1.6, boxSizing: "border-box"
    }} />
);

const Section = ({ label, badge, children, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 20, background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
          cursor: "pointer", borderBottom: open ? `1px solid ${C.border}` : "none",
          background: "#252018"
        }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: C.text, fontWeight: 700, fontSize: 13, letterSpacing: 0.3 }}>{label}</span>
          {badge && <Tag color={C.gold}>{badge}</Tag>}
        </div>
        <span style={{ color: C.muted, fontSize: 16, transform: open ? "rotate(180deg)" : "none", transition: "0.2s" }}>▾</span>
      </div>
      {open && <div style={{ padding: 16 }}>{children}</div>}
    </div>
  );
};

// ─── Monthly Metric Card ─────────────────────────────────────────
const MonthlyMetricCard = ({ label, weeks, setWeeks, monthTarget, setMonthTarget, isRevenue, noTarget, conversionDenominator }) => {
  const [activeWeek, setActiveWeek] = useState(getCurrentWeekOfMonth() - 1);
  const weekLabels = ["W1", "W2", "W3", "W4"];

  const weekValues = weeks.map(v => v === "" ? 0 : Number(v) || 0);
  const filledCount = weekValues.filter(v => v > 0).length;
  const total = weekValues.reduce((a, b) => a + b, 0);
  const target = monthTarget !== "" ? Number(monthTarget) || 0 : 0;
  const weekTarget = target > 0 ? target / 4 : 0;
  const projected = filledCount > 0 ? Math.round((total / filledCount) * 4) : 0;
  const pctDone = target > 0 && total > 0 ? Number(((total / target) * 100).toFixed(1)) : null;
  const projPct = target > 0 && projected > 0 ? Number(((projected / target) * 100).toFixed(1)) : null;
  const convDenom = Number(conversionDenominator) || 0;
  const convTarget = convDenom > 0 ? Math.round(convDenom * 0.7) : null;
  const sc = p => p >= 100 ? C.green : p >= 70 ? C.amber : C.red;

  return (
    <div style={{ background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`, padding: 16, marginBottom: 14 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <div style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>{label}</div>
          {noTarget && convTarget && <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>Target: 70% of walk-ins = {convTarget}</div>}
        </div>
        {!noTarget && (
          <div style={{ textAlign: "right" }}>
            <div style={{ color: C.muted, fontSize: 10, marginBottom: 3 }}>Monthly Target</div>
            <Input value={monthTarget} onChange={setMonthTarget}
              placeholder={isRevenue ? "e.g. 1500000" : "e.g. 100"}
              prefix={isRevenue ? "$" : ""} />
          </div>
        )}
      </div>

      {/* Week boxes */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 14 }}>
        {weekLabels.map((wl, i) => {
          const active = i === activeWeek;
          const val = weekValues[i];
          const wPct = weekTarget > 0 && val > 0 ? Math.round((val / weekTarget) * 100) : null;
          return (
            <div key={i} onMouseDown={() => setActiveWeek(i)} style={{
              background: active ? "#2a2215" : C.bg, borderRadius: 8, padding: "10px 8px",
              border: `2px solid ${active ? C.gold : C.border}`, cursor: "pointer"
            }}>
              <div style={{ color: active ? C.gold : C.muted, fontSize: 10, fontWeight: 700, textAlign: "center", marginBottom: 6 }}>
                {wl}{active ? " ←" : ""}
              </div>
              <input type="number" value={weeks[i]}
                onChange={e => { const n = [...weeks]; n[i] = e.target.value; setWeeks(n); }}
                placeholder="—"
                style={{
                  width: "100%", background: "transparent", border: "none",
                  borderBottom: `1px solid ${active ? C.goldDim : C.border}`,
                  color: C.text, padding: "2px 0", fontSize: 14, fontWeight: 700,
                  outline: "none", textAlign: "center", fontFamily: "inherit", boxSizing: "border-box"
                }}
              />
              {wPct !== null && (
                <div style={{ textAlign: "center", marginTop: 4 }}>
                  <span style={{ background: `${sc(wPct)}22`, color: sc(wPct), border: `1px solid ${sc(wPct)}44`, borderRadius: 4, fontSize: 10, padding: "1px 6px", fontWeight: 700 }}>
                    {wPct}%
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* MTD strip — always show, populate as data arrives */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: total > 0 && target > 0 ? 12 : 0 }}>
        <div style={{ background: C.bg, borderRadius: 8, padding: "10px 8px", textAlign: "center" }}>
          <div style={{ color: C.muted, fontSize: 10, marginBottom: 3 }}>MTD Total</div>
          <div style={{ color: total > 0 ? C.text : C.muted, fontWeight: 800, fontSize: 16 }}>
            {total > 0 ? (isRevenue ? fmtUSD(total) : total) : "—"}
          </div>
        </div>
        <div style={{ background: C.bg, borderRadius: 8, padding: "10px 8px", textAlign: "center" }}>
          <div style={{ color: C.muted, fontSize: 10, marginBottom: 3 }}>% of Target</div>
          <div style={{ color: pctDone !== null ? sc(pctDone) : C.muted, fontWeight: 800, fontSize: 16 }}>
            {pctDone !== null ? `${pctDone}%` : "—"}
          </div>
        </div>
        <div style={{ background: C.bg, borderRadius: 8, padding: "10px 8px", textAlign: "center" }}>
          <div style={{ color: C.muted, fontSize: 10, marginBottom: 3 }}>Projected</div>
          <div style={{ color: projPct !== null ? sc(projPct) : C.muted, fontWeight: 800, fontSize: 16 }}>
            {projPct !== null ? (isRevenue ? fmtUSD(projected) : projected) : "—"}
          </div>
        </div>
      </div>

      {/* Progress bar — only when both target and data present */}
      {total > 0 && target > 0 && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ color: C.muted, fontSize: 11 }}>Month progress</span>
            <span style={{ color: sc(pctDone), fontSize: 11, fontWeight: 700 }}>
              {pctDone}% of {isRevenue ? fmtUSD(target) : target}
            </span>
          </div>
          <ProgressBar value={total} max={target} color={sc(pctDone)} height={8} />
          {projected > 0 && (
            <div style={{ marginTop: 6, fontSize: 11, color: C.muted }}>
              At current pace → <span style={{ color: sc(projPct), fontWeight: 700 }}>{isRevenue ? fmtUSD(projected) : projected}</span>
              {" "}by month end {projPct >= 100 ? "✅" : projPct >= 80 ? "⚠️" : "🔴"}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Weekly-only metric ──────────────────────────────────────────
const WeeklyMetric = ({ label, target, value, onChange, suffix = "", isGte = true, note }) => {
  const num = safeNum(value);
  const tgt = safeNum(target);
  const hit = value !== "" && tgt ? (isGte ? num >= tgt : num <= tgt) : null;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
      borderBottom: `1px solid ${C.border}`
    }}>
      <div style={{ flex: 2 }}>
        <div style={{ color: C.text, fontSize: 13 }}>{label}</div>
        {note && <div style={{ color: C.muted, fontSize: 11 }}>{note}</div>}
      </div>
      <div style={{ color: C.muted, fontSize: 11, flex: 1, textAlign: "center" }}>
        Target {isGte ? "≥" : "≤"}{target}{suffix}
      </div>
      <div style={{ flex: 1 }}>
        <Input value={value} onChange={onChange} suffix={suffix} />
      </div>
      <div style={{ width: 24, textAlign: "center", fontSize: 16 }}>
        {hit === true ? "✅" : hit === false ? "⚠️" : ""}
      </div>
    </div>
  );
};

// ─── Checklist ───────────────────────────────────────────────────
const CheckItem = ({ label, checked, onChange }) => (
  <div onClick={() => onChange(!checked)} style={{
    display: "flex", alignItems: "center", gap: 10,
    padding: "8px 0", cursor: "pointer", borderBottom: `1px solid ${C.border}`
  }}>
    <div style={{
      width: 18, height: 18, borderRadius: 4, flexShrink: 0,
      border: `2px solid ${checked ? C.gold : C.muted}`,
      background: checked ? C.gold : "transparent",
      display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s"
    }}>
      {checked && <span style={{ color: C.bg, fontSize: 11, fontWeight: 900 }}>✓</span>}
    </div>
    <span style={{ color: checked ? C.text : C.muted, fontSize: 13, textDecoration: checked ? "line-through" : "none", transition: "all 0.15s" }}>
      {label}
    </span>
  </div>
);

// ─── IDS Item ────────────────────────────────────────────────────
const IDSItem = ({ index, onRemove }) => {
  const [d, setD] = useState({ title: "", identify: "", discuss: "", solve: "" });
  const set = k => v => setD(p => ({ ...p, [k]: v }));
  return (
    <div style={{ background: C.bg, borderRadius: 8, padding: 14, marginBottom: 12, border: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <Tag color={C.gold}>Issue #{index + 1}</Tag>
        <button onClick={onRemove} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 20 }}>×</button>
      </div>
      <div style={{ marginBottom: 8 }}>
        <Input value={d.title} onChange={set("title")} placeholder="Topic / title" />
      </div>
      {[["identify", "🔍 Identify — What is the issue?"], ["discuss", "💬 Discuss — Root cause"], ["solve", "✅ Solve — Action & owner"]].map(([k, ph]) => (
        <div key={k} style={{ marginBottom: 6 }}>
          <TA value={d[k]} onChange={set(k)} placeholder={ph} rows={2} />
        </div>
      ))}
    </div>
  );
};

// ─── Review Block Card ───────────────────────────────────────────
const ReviewBlock = ({ label, weeks, setWeeks, targetVal, setTarget }) => {
  const [active, setActive] = useState(getCurrentWeekOfMonth() - 1);
  const tgt = Number(targetVal) || 0;
  const wkTgt = tgt > 0 ? tgt / 4 : 0;
  const mtd = weeks.map(safeNum).reduce((a, b) => a + b, 0);
  const filledCount = weeks.filter(v => v !== "").length || 1;
  const projected = Math.round((mtd / filledCount) * 4);
  const mtdPct = tgt > 0 && mtd > 0 ? Number(((mtd / tgt) * 100).toFixed(1)) : null;
  const projPct = tgt > 0 && projected > 0 ? Number(((projected / tgt) * 100).toFixed(1)) : null;
  const sc = p => p >= 100 ? C.green : p >= 70 ? C.amber : C.red;

  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ color: C.text, fontSize: 13, fontWeight: 700 }}>{label}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: C.muted, fontSize: 11 }}>Monthly target</span>
          <div style={{ width: 76 }}>
            <Input value={targetVal} onChange={setTarget} placeholder="100" />
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 10 }}>
        {["W1","W2","W3","W4"].map((wl, i) => {
          const isActive = i === active;
          const val = safeNum(weeks[i]);
          const hit = weeks[i] !== "" && wkTgt > 0 ? val >= wkTgt : null;
          return (
            <div key={i} onMouseDown={() => setActive(i)} style={{
              background: isActive ? "#2a2215" : C.bg, borderRadius: 8, padding: "8px 6px",
              border: `2px solid ${isActive ? C.gold : C.border}`, cursor: "pointer"
            }}>
              <div style={{ color: isActive ? C.gold : C.muted, fontSize: 10, fontWeight: 700, textAlign: "center", marginBottom: 4 }}>
                {wl}{isActive ? " ←" : ""}
              </div>
              <input type="number" value={weeks[i]}
                onChange={e => { const n = [...weeks]; n[i] = e.target.value; setWeeks(n); }}
                placeholder="—"
                style={{ width: "100%", background: "transparent", border: "none", borderBottom: `1px solid ${isActive ? C.goldDim : C.border}`, color: C.text, padding: "2px 0", fontSize: 14, fontWeight: 700, outline: "none", textAlign: "center", fontFamily: "inherit", boxSizing: "border-box" }}
              />
              {weeks[i] !== "" && wkTgt > 0 && (
                <div style={{ textAlign: "center", marginTop: 3 }}>
                  <span style={{ fontSize: 10, color: hit ? C.green : C.red, fontWeight: 700 }}>
                    {Math.round((val / wkTgt) * 100)}%
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {/* MTD strip */}
      <div style={{ background: C.bg, borderRadius: 8, padding: "10px 12px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: mtdPct !== null ? 8 : 0 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ color: C.muted, fontSize: 10, marginBottom: 2 }}>MTD</div>
            <div style={{ color: mtd > 0 ? C.text : C.muted, fontWeight: 800, fontSize: 16 }}>{mtd || "—"}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ color: C.muted, fontSize: 10, marginBottom: 2 }}>% of Target</div>
            <div style={{ color: mtdPct !== null ? sc(mtdPct) : C.muted, fontWeight: 800, fontSize: 16 }}>{mtdPct !== null ? `${mtdPct}%` : "—"}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ color: C.muted, fontSize: 10, marginBottom: 2 }}>Projected</div>
            <div style={{ color: projPct !== null ? sc(projPct) : C.muted, fontWeight: 800, fontSize: 16 }}>{projPct !== null ? projected : "—"}</div>
          </div>
        </div>
        {mtdPct !== null && (
          <>
            <ProgressBar value={mtd} max={tgt} color={sc(mtdPct)} height={6} />
            <div style={{ fontSize: 11, color: sc(mtdPct), marginTop: 4, fontWeight: 700 }}>
              {mtdPct}% of {tgt} · on pace for {projected} {projPct >= 100 ? "✅" : "⚠️"}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ─── Avg Ticket Card ─────────────────────────────────────────────
const AvgTicketCard = ({ avgTicketWeeks, overallAvgTicket, totalInvoices, totalRevenue }) => {
  const [active, setActive] = useState(getCurrentWeekOfMonth() - 1);
  const hasAny = avgTicketWeeks.some(v => v !== "");
  return (
    <div style={{ background: C.surface, borderRadius: 10, border: `1px solid ${C.borderGold}`, padding: 16, marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>3 · Avg Ticket Size</div>
        <Tag color={C.blue}>Auto — Revenue ÷ Invoices</Tag>
      </div>
      {!hasAny && (
        <div style={{ color: C.muted, fontSize: 11, marginBottom: 10, fontStyle: "italic" }}>
          Enter Revenue (block 1) and Invoices (Supporting Metrics) to auto-calculate
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 12 }}>
        {["W1","W2","W3","W4"].map((wl, i) => {
          const isActive = i === active;
          const val = avgTicketWeeks[i];
          return (
            <div key={i} onMouseDown={() => setActive(i)} style={{
              background: isActive ? "#2a2215" : C.bg, borderRadius: 8, padding: "10px 8px",
              border: `2px solid ${isActive ? C.gold : C.border}`, cursor: "pointer"
            }}>
              <div style={{ color: isActive ? C.gold : C.muted, fontSize: 10, fontWeight: 700, textAlign: "center", marginBottom: 6 }}>
                {wl}{isActive ? " ←" : ""}
              </div>
              <div style={{ textAlign: "center", color: val ? C.text : C.muted, fontWeight: 800, fontSize: 14 }}>
                {val ? fmtUSD(Number(val)) : "—"}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ background: C.bg, borderRadius: 8, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ color: C.muted, fontSize: 10, marginBottom: 2 }}>Month Overall Avg Ticket</div>
          <div style={{ color: overallAvgTicket ? C.gold : C.muted, fontWeight: 800, fontSize: 22 }}>
            {overallAvgTicket ? fmtUSD(Number(overallAvgTicket)) : "—"}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: C.muted, fontSize: 10, marginBottom: 2 }}>Total Invoices MTD</div>
          <div style={{ color: totalInvoices > 0 ? C.text : C.muted, fontWeight: 700, fontSize: 18 }}>
            {totalInvoices || "—"}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Supporting Metrics Card ──────────────────────────────────────
const SupportingMetricsCard = ({ walkInWeeks, setWalkInWeeks, invoiceWeeks, setInvoiceWeeks }) => {
  const [active, setActive] = useState(getCurrentWeekOfMonth() - 1);
  const mtdWalkIns = walkInWeeks.map(safeNum).reduce((a, b) => a + b, 0);
  const mtdInvoices = invoiceWeeks.map(safeNum).reduce((a, b) => a + b, 0);
  const mtdConv = mtdWalkIns > 0 ? ((mtdInvoices / mtdWalkIns) * 100).toFixed(1) : null;

  return (
    <div style={{ background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`, padding: 16, marginBottom: 14 }}>
      {/* Column headers */}
      <div style={{ display: "grid", gridTemplateColumns: "80px repeat(4,1fr)", gap: 6, marginBottom: 10, alignItems: "center" }}>
        <div />
        {["W1","W2","W3","W4"].map((wl, i) => (
          <div key={i} onMouseDown={() => setActive(i)} style={{
            textAlign: "center", fontSize: 10, fontWeight: 700, cursor: "pointer",
            color: i === active ? C.gold : C.muted,
            background: i === active ? "#2a2215" : "transparent",
            borderRadius: 6, padding: "6px 0",
            border: `2px solid ${i === active ? C.gold : "transparent"}`
          }}>{wl}{i === active ? " ←" : ""}</div>
        ))}
      </div>

      {/* Walk-ins row */}
      <div style={{ display: "grid", gridTemplateColumns: "80px repeat(4,1fr)", gap: 6, marginBottom: 8, alignItems: "center" }}>
        <div style={{ color: C.muted, fontSize: 11, fontWeight: 600 }}>Walk-ins</div>
        {walkInWeeks.map((v, i) => (
          <input key={i} type="number" value={v}
            onChange={e => { const n = [...walkInWeeks]; n[i] = e.target.value; setWalkInWeeks(n); }}
            onFocus={() => setActive(i)}
            placeholder="—"
            style={{
              background: i === active ? "#2a2215" : C.bg,
              border: `2px solid ${i === active ? C.gold : C.border}`,
              borderRadius: 6, color: C.text, padding: "6px 0",
              fontSize: 13, fontWeight: 700, outline: "none",
              textAlign: "center", fontFamily: "inherit", width: "100%", boxSizing: "border-box"
            }}
          />
        ))}
      </div>

      {/* Invoices row */}
      <div style={{ display: "grid", gridTemplateColumns: "80px repeat(4,1fr)", gap: 6, marginBottom: 8, alignItems: "center" }}>
        <div style={{ color: C.muted, fontSize: 11, fontWeight: 600 }}>Invoices</div>
        {invoiceWeeks.map((v, i) => (
          <input key={i} type="number" value={v}
            onChange={e => { const n = [...invoiceWeeks]; n[i] = e.target.value; setInvoiceWeeks(n); }}
            onFocus={() => setActive(i)}
            placeholder="—"
            style={{
              background: i === active ? "#2a2215" : C.bg,
              border: `2px solid ${i === active ? C.gold : C.border}`,
              borderRadius: 6, color: C.text, padding: "6px 0",
              fontSize: 13, fontWeight: 700, outline: "none",
              textAlign: "center", fontFamily: "inherit", width: "100%", boxSizing: "border-box"
            }}
          />
        ))}
      </div>

      {/* Conv % row — auto */}
      <div style={{ display: "grid", gridTemplateColumns: "80px repeat(4,1fr)", gap: 6, marginBottom: 14, alignItems: "center" }}>
        <div style={{ color: C.muted, fontSize: 11, fontWeight: 600 }}>Conv %</div>
        {["W1","W2","W3","W4"].map((_, i) => {
          const wi = safeNum(walkInWeeks[i]);
          const inv = safeNum(invoiceWeeks[i]);
          const c = wi > 0 && inv > 0 ? ((inv / wi) * 100).toFixed(1) : null;
          const hit = c !== null ? parseFloat(c) >= 70 : null;
          return (
            <div key={i} style={{
              background: hit === true ? "#1a3a2a" : hit === false ? "#3a1a1a" : C.bg,
              border: `1px solid ${hit === true ? C.green + "44" : hit === false ? C.red + "44" : C.border}`,
              borderRadius: 6, padding: "6px 0", textAlign: "center",
              color: hit === true ? C.green : hit === false ? C.red : C.muted,
              fontSize: 13, fontWeight: 700
            }}>{c ? `${c}%` : "—"}</div>
          );
        })}
      </div>

      {/* MTD strip */}
      <div style={{ background: C.bg, borderRadius: 8, padding: "12px 14px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: C.muted, fontSize: 10, marginBottom: 3 }}>MTD Walk-ins</div>
          <div style={{ color: mtdWalkIns > 0 ? C.text : C.muted, fontWeight: 800, fontSize: 18 }}>{mtdWalkIns || "—"}</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: C.muted, fontSize: 10, marginBottom: 3 }}>MTD Invoices</div>
          <div style={{ color: mtdInvoices > 0 ? C.text : C.muted, fontWeight: 800, fontSize: 18 }}>{mtdInvoices || "—"}</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: C.muted, fontSize: 10, marginBottom: 3 }}>MTD Conversion</div>
          <div style={{ color: mtdConv ? (parseFloat(mtdConv) >= 70 ? C.green : C.red) : C.muted, fontWeight: 800, fontSize: 18 }}>
            {mtdConv ? `${mtdConv}%` : "—"}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: C.muted }}>Conversion = Invoices ÷ Walk-ins · Target ≥70%</div>
    </div>
  );
};

// ─── Studded Ratio Card ──────────────────────────────────────────
const StuddedRatioCard = ({ stddWeeks, setStddWeeks: setStddW }) => {
  const [active, setActive] = useState(getCurrentWeekOfMonth() - 1);
  return (
    <div style={{ background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`, padding: 16, marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>2 · Studded Ratio</div>
        <Tag color={C.amber}>Target ≥45% / week</Tag>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 12 }}>
        {["W1","W2","W3","W4"].map((wl, i) => {
          const val = safeNum(stddWeeks[i]);
          const hit = stddWeeks[i] !== "" ? val >= 45 : null;
          const isActive = i === active;
          return (
            <div key={i} onMouseDown={() => setActive(i)} style={{
              background: isActive ? "#2a2215" : C.bg, borderRadius: 8, padding: "10px 8px",
              border: `2px solid ${isActive ? C.gold : C.border}`, cursor: "pointer"
            }}>
              <div style={{ color: isActive ? C.gold : C.muted, fontSize: 10, fontWeight: 700, textAlign: "center", marginBottom: 6 }}>
                {wl}{isActive ? " ←" : ""}
              </div>
              <input type="number" value={stddWeeks[i]}
                onChange={e => { const n=[...stddWeeks]; n[i]=e.target.value; setStddW(n); }}
                placeholder="—"
                style={{ width:"100%", background:"transparent", border:"none", borderBottom:`1px solid ${isActive ? C.goldDim : C.border}`, color: hit===true ? C.green : hit===false ? C.red : C.text, padding:"2px 0", fontSize:14, fontWeight:700, outline:"none", textAlign:"center", fontFamily:"inherit", boxSizing:"border-box" }}
              />
              {stddWeeks[i] !== "" && <div style={{ textAlign:"center", marginTop:4, fontSize:16 }}>{hit ? "✅" : "⚠️"}</div>}
            </div>
          );
        })}
      </div>
      {stddWeeks.some(v => v !== "") && (() => {
        const filled = stddWeeks.filter(v => v !== "").map(safeNum);
        const avg = Number((filled.reduce((a,b)=>a+b,0)/filled.length).toFixed(1));
        return (
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ flex:1, background:C.bg, borderRadius:8, padding:"10px 12px", textAlign:"center" }}>
              <div style={{ color:C.muted, fontSize:10, marginBottom:3 }}>MTD Avg</div>
              <div style={{ color: avg>=45 ? C.green : C.red, fontWeight:800, fontSize:18 }}>{avg}%</div>
            </div>
            <div style={{ flex:2 }}>
              <ProgressBar value={avg} max={100} color={avg>=45 ? C.green : C.red} height={8} />
              <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>Month average vs 45% target</div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

// ─── Exceptional Discount Card ───────────────────────────────────
const ExceptionalDiscountCard = ({ entries, setEntries }) => {
  const addRow = () => setEntries(prev => [...prev, {
    name: "", number: "", productCode: "",
    beforePct: "", beforePrice: "",
    afterPct: "", afterPrice: "",
    comment: "", updatedSheet: false
  }]);
  const removeRow = (i) => setEntries(prev => prev.filter((_, j) => j !== i));
  const update = (i, field, val) => setEntries(prev => prev.map((r, j) => j === i ? { ...r, [field]: val } : r));

  const inputStyle = (highlight) => ({
    width: "100%", background: C.surface,
    border: `1px solid ${highlight ? C.amber + "66" : C.border}`,
    borderRadius: 6, color: highlight ? C.amber : C.text,
    padding: "6px 10px", fontSize: 13, outline: "none",
    fontFamily: "inherit", boxSizing: "border-box"
  });

  return (
    <div style={{ background: C.surface, borderRadius: 10, border: `1px solid ${C.amber}44`, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <Tag color={C.amber}>Exceptional Discounts</Tag>
        <span style={{ color: C.muted, fontSize: 11 }}>Discounts requiring approval / logging</span>
      </div>

      {entries.length === 0 && (
        <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic", marginBottom: 12 }}>No exceptional discounts this week</div>
      )}

      {entries.map((row, i) => {
        const saving = row.beforePrice && row.afterPrice
          ? Number(row.beforePrice) - Number(row.afterPrice) : null;
        return (
          <div key={i} style={{ background: C.bg, borderRadius: 8, padding: "12px 12px 10px", marginBottom: 10, border: `1px solid ${C.border}` }}>
            {/* Row header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: C.amber, fontWeight: 800, fontSize: 12 }}>#{i + 1}</span>
                {saving !== null && (
                  <span style={{ color: C.red, fontSize: 11, fontWeight: 700 }}>
                    Discount: ${saving.toLocaleString()}
                  </span>
                )}
              </div>
              <button onMouseDown={() => removeRow(i)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 18, padding: 0 }}>×</button>
            </div>

            {/* Customer + Number + Product Code */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div>
                <div style={{ color: C.muted, fontSize: 10, marginBottom: 3 }}>Customer Name</div>
                <input value={row.name} onChange={e => update(i, "name", e.target.value)} placeholder="e.g. Rajesh Kumar" style={inputStyle(false)} />
              </div>
              <div>
                <div style={{ color: C.muted, fontSize: 10, marginBottom: 3 }}>Phone Number</div>
                <input value={row.number} onChange={e => update(i, "number", e.target.value)} placeholder="e.g. 9876543210" style={inputStyle(false)} />
              </div>
              <div>
                <div style={{ color: C.muted, fontSize: 10, marginBottom: 3 }}>Product Code</div>
                <input value={row.productCode} onChange={e => update(i, "productCode", e.target.value)} placeholder="e.g. SKU-1234" style={inputStyle(false)} />
              </div>
            </div>

            {/* Before / After discount */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 8px 1fr 1fr", gap: 8, alignItems: "end", marginBottom: 10 }}>
              <div>
                <div style={{ color: C.muted, fontSize: 10, marginBottom: 3 }}>Before Disc %</div>
                <input type="number" value={row.beforePct} onChange={e => update(i, "beforePct", e.target.value)} placeholder="e.g. 0"
                  style={{ ...inputStyle(false), color: C.text }} />
              </div>
              <div>
                <div style={{ color: C.muted, fontSize: 10, marginBottom: 3 }}>Before Price ($)</div>
                <input type="number" value={row.beforePrice} onChange={e => update(i, "beforePrice", e.target.value)} placeholder="e.g. 5000"
                  style={{ ...inputStyle(false), color: C.text }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: 6 }}>
                <span style={{ color: C.muted, fontSize: 14 }}>→</span>
              </div>
              <div>
                <div style={{ color: C.amber, fontSize: 10, marginBottom: 3 }}>After Disc %</div>
                <input type="number" value={row.afterPct} onChange={e => update(i, "afterPct", e.target.value)} placeholder="e.g. 15"
                  style={{ ...inputStyle(true) }} />
              </div>
              <div>
                <div style={{ color: C.amber, fontSize: 10, marginBottom: 3 }}>After Price ($)</div>
                <input type="number" value={row.afterPrice} onChange={e => update(i, "afterPrice", e.target.value)} placeholder="e.g. 4250"
                  style={{ ...inputStyle(true) }} />
              </div>
            </div>

            {/* Comment */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ color: C.muted, fontSize: 10, marginBottom: 3 }}>Comment / Reason</div>
              <textarea value={row.comment} onChange={e => update(i, "comment", e.target.value)}
                placeholder="e.g. Loyal customer, bulk purchase, special occasion…"
                rows={2}
                style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, padding: "6px 10px", fontSize: 12, outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5, boxSizing: "border-box" }}
              />
            </div>

            {/* Updated in central sheet checkbox */}
            <div onMouseDown={() => update(i, "updatedSheet", !row.updatedSheet)}
              style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "6px 0", borderTop: `1px solid ${C.border}`, marginTop: 2 }}>
              <div style={{
                width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                border: `2px solid ${row.updatedSheet ? C.green : C.muted}`,
                background: row.updatedSheet ? C.green : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s"
              }}>
                {row.updatedSheet && <span style={{ color: C.bg, fontSize: 11, fontWeight: 900 }}>✓</span>}
              </div>
              <span style={{ color: row.updatedSheet ? C.green : C.muted, fontSize: 12, fontWeight: 600 }}>
                {row.updatedSheet ? "Updated in central sheet ✓" : "Not yet updated in central sheet"}
              </span>
            </div>
          </div>
        );
      })}

      <button onMouseDown={addRow} style={{
        width: "100%", background: "none", border: `1px dashed ${C.amber}`,
        color: C.amber, borderRadius: 8, padding: "8px 0", cursor: "pointer", fontSize: 12, letterSpacing: 0.5
      }}>+ Add Discount Entry</button>
    </div>
  );
};

// ─── Person Block ─────────────────────────────────────────────────
const STATUS_OPTIONS = ["Not Started", "In Progress", "Finished"];
const STATUS_COLORS = { "Not Started": "#6B5F4E", "In Progress": "#E8A838", "Finished": "#4CAF7A" };

const PersonBlock = ({ name, tasks, setTasks }) => {
  const addTask = () => setTasks(prev => [...prev, { task: "", deadline: "", status: "Not Started", notes: [""] }]);
  const removeTask = (i) => setTasks(prev => prev.filter((_, j) => j !== i));
  const updateTask = (i, field, val) => setTasks(prev => prev.map((t, j) => j === i ? { ...t, [field]: val } : t));

  const addNote = (i) => setTasks(prev => prev.map((t, j) => j === i ? { ...t, notes: [...t.notes, ""] } : t));
  const updateNote = (i, ni, val) => setTasks(prev => prev.map((t, j) => j === i ? { ...t, notes: t.notes.map((n, k) => k === ni ? val : n) } : t));
  const removeNote = (i, ni) => setTasks(prev => prev.map((t, j) => j === i ? { ...t, notes: t.notes.filter((_, k) => k !== ni) } : t));

  const done = tasks.filter(t => t.status === "Finished").length;

  return (
    <div style={{ background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`, padding: 16, marginBottom: 14 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: C.goldDim, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: C.gold, fontWeight: 800, fontSize: 13 }}>{name[0]}</span>
          </div>
          <span style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>{name}</span>
        </div>
        {tasks.length > 0 && (
          <span style={{ color: done === tasks.length ? C.green : C.muted, fontSize: 11, fontWeight: 600 }}>
            {done}/{tasks.length} done
          </span>
        )}
      </div>

      {tasks.length === 0 && (
        <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic", marginBottom: 12 }}>No tasks yet</div>
      )}

      {tasks.map((t, i) => (
        <div key={i} style={{ background: C.bg, borderRadius: 8, padding: "12px 12px 10px", marginBottom: 10, border: `1px solid ${t.status === "Finished" ? C.green + "33" : C.border}` }}>
          {/* Task row header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ color: C.gold, fontWeight: 800, fontSize: 11 }}>Task {i + 1}</span>
            <button onMouseDown={() => removeTask(i)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 18, padding: 0 }}>×</button>
          </div>

          {/* Task name */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ color: C.muted, fontSize: 10, marginBottom: 3 }}>Task</div>
            <input value={t.task} onChange={e => updateTask(i, "task", e.target.value)} placeholder="What needs to be done?"
              style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, padding: "6px 10px", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>

          {/* Deadline + Status */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            <div>
              <div style={{ color: C.muted, fontSize: 10, marginBottom: 3 }}>Deadline</div>
              <input type="date" value={t.deadline} onChange={e => updateTask(i, "deadline", e.target.value)}
                style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, color: t.deadline ? C.text : C.muted, padding: "6px 10px", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box", colorScheme: "dark" }} />
            </div>
            <div>
              <div style={{ color: C.muted, fontSize: 10, marginBottom: 3 }}>Status</div>
              <div style={{ display: "flex", gap: 4 }}>
                {STATUS_OPTIONS.map(s => (
                  <div key={s} onMouseDown={() => updateTask(i, "status", s)} style={{
                    flex: 1, textAlign: "center", padding: "5px 2px", borderRadius: 6, cursor: "pointer", fontSize: 9, fontWeight: 700,
                    background: t.status === s ? STATUS_COLORS[s] + "33" : C.surface,
                    border: `1px solid ${t.status === s ? STATUS_COLORS[s] : C.border}`,
                    color: t.status === s ? STATUS_COLORS[s] : C.muted,
                    transition: "all 0.15s"
                  }}>{s}</div>
                ))}
              </div>
            </div>
          </div>

          {/* Bullet notes */}
          <div>
            <div style={{ color: C.muted, fontSize: 10, marginBottom: 6 }}>Notes</div>
            {t.notes.map((note, ni) => (
              <div key={ni} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <span style={{ color: C.gold, fontSize: 14, flexShrink: 0 }}>•</span>
                <input value={note} onChange={e => updateNote(i, ni, e.target.value)} placeholder="Add a point…"
                  style={{ flex: 1, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, padding: "5px 8px", fontSize: 12, outline: "none", fontFamily: "inherit" }} />
                {t.notes.length > 1 && (
                  <button onMouseDown={() => removeNote(i, ni)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 15, padding: 0, flexShrink: 0 }}>×</button>
                )}
              </div>
            ))}
            <button onMouseDown={() => addNote(i)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 11, padding: "2px 0", textDecoration: "underline" }}>
              + add point
            </button>
          </div>
        </div>
      ))}

      <button onMouseDown={addTask} style={{
        width: "100%", background: "none", border: `1px dashed ${C.border}`,
        color: C.muted, borderRadius: 8, padding: "7px 0", cursor: "pointer", fontSize: 12
      }}>+ Add Task</button>
    </div>
  );
};

// ─── HNI Card ────────────────────────────────────────────────────
const HNICard = ({ entries, setEntries }) => {
  const addRow = () => setEntries(prev => [...prev, { name: "", number: "", value: "", followUp: false }]);
  const removeRow = (i) => setEntries(prev => prev.filter((_, j) => j !== i));
  const update = (i, field, val) => setEntries(prev => prev.map((r, j) => j === i ? { ...r, [field]: val } : r));

  return (
    <div style={{ background: C.surface, borderRadius: 10, border: `1px solid ${C.borderGold}`, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <Tag color={C.gold}>HNI</Tag>
        <span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>Sales ≥ $20,000 this week</span>
      </div>

      {entries.length === 0 && (
        <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic", marginBottom: 12 }}>No HNI entries yet — add one below</div>
      )}

      {entries.map((row, i) => (
        <div key={i} style={{ background: C.bg, borderRadius: 8, padding: "12px 12px 10px", marginBottom: 10, border: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ color: C.gold, fontWeight: 800, fontSize: 12 }}>#{i + 1}</span>
            <button onMouseDown={() => removeRow(i)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 18, padding: 0, lineHeight: 1 }}>×</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <div>
              <div style={{ color: C.muted, fontSize: 10, marginBottom: 3 }}>Customer Name</div>
              <input value={row.name} onChange={e => update(i, "name", e.target.value)} placeholder="e.g. Priya Sharma"
                style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, padding: "6px 10px", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
            <div>
              <div style={{ color: C.muted, fontSize: 10, marginBottom: 3 }}>Phone Number</div>
              <input value={row.number} onChange={e => update(i, "number", e.target.value)} placeholder="e.g. 9876543210"
                style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, padding: "6px 10px", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <div style={{ color: C.muted, fontSize: 10, marginBottom: 3 }}>Bill Value ($)</div>
            <input type="number" value={row.value} onChange={e => update(i, "value", e.target.value)} placeholder="e.g. 25000"
              style={{ width: "100%", background: C.surface, border: `1px solid ${row.value && Number(row.value) >= 20000 ? C.gold + "66" : C.border}`, borderRadius: 6, color: row.value && Number(row.value) >= 20000 ? C.gold : C.text, padding: "6px 10px", fontSize: 13, fontWeight: 700, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>

          <div onMouseDown={() => update(i, "followUp", !row.followUp)}
            style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "6px 0" }}>
            <div style={{
              width: 18, height: 18, borderRadius: 4, flexShrink: 0,
              border: `2px solid ${row.followUp ? C.green : C.muted}`,
              background: row.followUp ? C.green : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s"
            }}>
              {row.followUp && <span style={{ color: C.bg, fontSize: 11, fontWeight: 900 }}>✓</span>}
            </div>
            <span style={{ color: row.followUp ? C.green : C.muted, fontSize: 12, fontWeight: 600 }}>
              {row.followUp ? "Owner follow-up done" : "Owner follow-up pending"}
            </span>
          </div>
        </div>
      ))}

      <button onMouseDown={addRow} style={{
        width: "100%", background: "none", border: `1px dashed ${C.gold}`,
        color: C.gold, borderRadius: 8, padding: "8px 0", cursor: "pointer", fontSize: 12, letterSpacing: 0.5
      }}>+ Add HNI Entry</button>
    </div>
  );
};

// ─── Main App ────────────────────────────────────────────────────
const EMPTY_MONTH = () => ({
  targets: { revenue: "", reviews: "", ghp: "", nps: "" },
  revWeeks: ["","","",""], invoiceWeeks: ["","","",""],
  reviewWeeks: ["","","",""], npsWeeks: ["","","",""],
  ghpWeeks: ["","","",""], walkInWeeks: ["","","",""],
  stddWeeks: ["","","",""],
  hni: "", hniEntries: [], discountEntries: [],
  tasks: { greeshma: [], manish: [], shweta: [], vidya: [] },
});

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
const monthLabel = (d) => d.toLocaleString("en-US", { month: "long", year: "numeric" });

export default function App() {
  const now = new Date();
  const [currentDate, setCurrentDate] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [monthData, setMonthData] = useState({ [monthKey(now)]: EMPTY_MONTH() });

  const key = monthKey(currentDate);
  const isCurrentMonth = monthKey(currentDate) === monthKey(now);
  const data = monthData[key] || EMPTY_MONTH();

  const setData = (updater) => setMonthData(prev => {
    const existing = prev[key] || EMPTY_MONTH();
    return { ...prev, [key]: updater(existing) };
  });

  const setTargets = (k) => (v) => setData(d => ({ ...d, targets: { ...d.targets, [k]: v } }));
  const setWeekArr = (field) => (v) => setData(d => ({ ...d, [field]: v }));
  const setHni = (v) => setData(d => ({ ...d, hni: v }));
  const setHniEntries = (v) => setData(d => ({ ...d, hniEntries: typeof v === "function" ? v(d.hniEntries) : v }));
  const setDiscountEntries = (v) => setData(d => ({ ...d, discountEntries: typeof v === "function" ? v(d.discountEntries) : v }));
  const setPersonTasks = (person) => (v) => setData(d => ({ ...d, tasks: { ...d.tasks, [person]: typeof v === "function" ? v(d.tasks[person]) : v } }));

  const prevMonth = () => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => {
    const next = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    const limit = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    if (next <= limit) setCurrentDate(next);
  };
  const canGoNext = currentDate < new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const { targets, revWeeks, invoiceWeeks, reviewWeeks, npsWeeks, ghpWeeks, walkInWeeks, stddWeeks, hni, hniEntries, discountEntries, tasks } = data;

  const [saveStatus, setSaveStatus] = useState("saved");

  // Auto-load from Firebase when month changes
  useEffect(() => {
    setSaveStatus("loading");
    loadMonthData(key).then(saved => {
      if (saved) {
        setMonthData(prev => ({ ...prev, [key]: { ...EMPTY_MONTH(), ...saved } }));
      }
      setSaveStatus("saved");
    });
  }, [key]);

  // Auto-save to Firebase when data changes (debounced 1.5s)
  useEffect(() => {
    setSaveStatus("saving");
    const timer = setTimeout(() => {
      saveMonthData(key, data).then(() => setSaveStatus("saved"));
    }, 1500);
    return () => clearTimeout(timer);
  }, [data, key]);

  // Derived
  const avgTicketWeeks = revWeeks.map((r, i) => {
    const rev = safeNum(r); const inv = safeNum(invoiceWeeks[i]);
    return rev > 0 && inv > 0 ? (rev / inv).toFixed(0) : "";
  });
  const totalRevenue = revWeeks.map(safeNum).reduce((a, b) => a + b, 0);
  const totalInvoices = invoiceWeeks.map(safeNum).reduce((a, b) => a + b, 0);
  const overallAvgTicket = totalRevenue > 0 && totalInvoices > 0 ? (totalRevenue / totalInvoices).toFixed(0) : null;

  // Notes + checklist (stay per-session, not per-month)
  const [notes, setNotes] = useState({ corporate: "", tcl: "", customers: "", employees: "", lookAhead: "", merch: "", followups: "", closeout: "" });
  const setN = k => v => setNotes(p => ({ ...p, [k]: v }));

  // Checklist
  const checklist = [
    "Lead online — log & assign",
    "Stock inward expected / backlog check",
    "Customer leads review",
    "Tally book check",
    "Postbox check",
    "Bank deposit (if needed)",
    "TV videos up to date",
    "Easel & tent cards current",
    "Packaging material stocked",
    "Mail follow-ups actioned",
    "Custom order enquiry follow-ups",
  ];
  const [checked, setChecked] = useState(checklist.map(() => false));
  const toggleCheck = i => setChecked(p => p.map((v, j) => j === i ? !v : v));
  const doneCount = checked.filter(Boolean).length;

  // IDS
  const [idsKeys, setIdsKeys] = useState([0]);
  const addIDS = () => setIdsKeys(p => [...p, p.length]);
  const removeIDS = i => setIdsKeys(p => p.filter((_, j) => j !== i));

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "'Inter','Segoe UI',sans-serif", paddingBottom: 60 }}>

      {/* Header */}
      <div style={{
        background: `linear-gradient(160deg, #221A0A 0%, #111009 100%)`,
        borderBottom: `2px solid ${C.gold}`,
        padding: "20px 20px 16px",
        position: "sticky", top: 0, zIndex: 20
      }}>
        <div style={{ maxWidth: 740, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ color: C.gold, fontSize: 10, letterSpacing: 2.5, textTransform: "uppercase", marginBottom: 3 }}>Weekly Pulse</div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5 }}>Weekly Pulse</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: C.gold, fontWeight: 700, fontSize: 13 }}>{getWeekLabel()}</div>
            <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{monthLabel(currentDate)}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 6, justifyContent: "flex-end" }}>
              <div style={{
                display: "inline-block",
                background: saveStatus === "saved" ? "#1a3a2a" : "#2a1f0a",
                border: `1px solid ${saveStatus === "saved" ? C.green : C.gold}`,
                borderRadius: 20, padding: "2px 10px", fontSize: 11,
                color: saveStatus === "saved" ? C.green : C.gold
              }}>
                {saveStatus === "loading" ? "⏳ Loading..." : saveStatus === "saving" ? "💾 Saving..." : "✅ Saved"}
              </div>
              <div style={{
                display: "inline-block",
                background: doneCount === checklist.length ? "#1a3a2a" : "#2a1f0a",
                border: `1px solid ${doneCount === checklist.length ? C.green : C.gold}`,
                borderRadius: 20, padding: "2px 10px", fontSize: 11,
                color: doneCount === checklist.length ? C.green : C.gold
              }}>
                Checklist {doneCount}/{checklist.length}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 740, margin: "0 auto", padding: "20px 14px 0" }}>

        {/* ── SALES METRICS ── */}
        <Section label="Sales Metrics" badge={monthLabel(currentDate)}>

          {/* Month switcher */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: C.bg, borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
            <button onMouseDown={prevMonth} style={{ background: "none", border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontSize: 16 }}>←</button>
            <div style={{ textAlign: "center" }}>
              <div style={{ color: C.gold, fontWeight: 800, fontSize: 15 }}>{monthLabel(currentDate)}</div>
              {!isCurrentMonth && (
                <div style={{ color: currentDate > new Date(now.getFullYear(), now.getMonth(), 1) ? C.blue : C.amber, fontSize: 10, marginTop: 2 }}>
                  {currentDate > new Date(now.getFullYear(), now.getMonth(), 1) ? "📋 Setting up next month" : "📖 Viewing past month"}
                </div>
              )}
            </div>
            <button onMouseDown={nextMonth} style={{ background: "none", border: `1px solid ${canGoNext ? C.border : C.border+"44"}`, color: canGoNext ? C.text : C.muted, borderRadius: 6, padding: "4px 12px", cursor: canGoNext ? "pointer" : "default", fontSize: 16 }}>→</button>
          </div>

          <div style={{ color: C.muted, fontSize: 11, marginBottom: 14, lineHeight: 1.6 }}>
            Enter weekly actuals. Set monthly revenue target once at the start of the month.
          </div>

          {/* ── PRIMARY: Revenue ── */}
          <div style={{ color: C.gold, fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>Primary Metrics</div>

          <MonthlyMetricCard
            label="1 · Revenue"
            monthTarget={targets.revenue} setMonthTarget={setTargets("revenue")}
            weeks={revWeeks} setWeeks={setWeekArr("revWeeks")}
            isRevenue
          />

          {/* ── PRIMARY: Studded Ratio ── */}
          <StuddedRatioCard stddWeeks={stddWeeks} setStddWeeks={setWeekArr("stddWeeks")} />

          {/* ── PRIMARY: Avg Ticket Size (auto) ── */}
          <AvgTicketCard avgTicketWeeks={avgTicketWeeks} overallAvgTicket={overallAvgTicket} totalInvoices={totalInvoices} totalRevenue={totalRevenue} />

          {/* ── SUPPORTING METRICS ── */}
          <div style={{ color:C.muted, fontSize:10, fontWeight:700, letterSpacing:1.5, textTransform:"uppercase", marginBottom:8 }}>Supporting Metrics</div>

          {/* Walk-ins + Invoices + Conversion — one combined card */}
          <SupportingMetricsCard
            walkInWeeks={walkInWeeks} setWalkInWeeks={setWeekArr("walkInWeeks")}
            invoiceWeeks={invoiceWeeks} setInvoiceWeeks={setWeekArr("invoiceWeeks")}
          />

          <MonthlyMetricCard
            label="GHP / Rivaah Enrollments"
            monthTarget={targets.ghp || "22"} setMonthTarget={setTargets("ghp")}
            weeks={ghpWeeks} setWeeks={setWeekArr("ghpWeeks")}
          />


          {/* Google Reviews + NPS — combined block */}
          <div style={{ background:C.surface, borderRadius:10, border:`1px solid ${C.border}`, padding:16, marginBottom:14 }}>
            <div style={{ color:C.muted, fontSize:10, fontWeight:700, letterSpacing:1.5, textTransform:"uppercase", marginBottom:14 }}>Reviews & NPS</div>

            <ReviewBlock
              label="Google Reviews"
              weeks={reviewWeeks} setWeeks={setWeekArr("reviewWeeks")}
              targetVal={targets.reviews} setTarget={setTargets("reviews")}
            />

            <div style={{ borderTop:`1px solid ${C.border}`, margin:"16px 0" }} />

            <ReviewBlock
              label="NPS Reviews"
              weeks={npsWeeks} setWeeks={setWeekArr("npsWeeks")}
              targetVal={targets.nps} setTarget={setTargets("nps")}
            />

            {/* % Reach Calculator */}
            <div style={{ borderTop:`1px solid ${C.border}`, marginTop:16, paddingTop:14 }}>
              <div style={{ color:C.muted, fontSize:10, fontWeight:700, letterSpacing:1.5, textTransform:"uppercase", marginBottom:10 }}>% Reach Calculator</div>
              <div style={{ color:C.muted, fontSize:11, marginBottom:12 }}>
                What % of customers are leaving reviews? Enter invoices and reviews to see reach.
              </div>
              {(() => {
                const mtdInv = invoiceWeeks.map(safeNum).reduce((a,b)=>a+b,0);
                const mtdGoog = reviewWeeks.map(safeNum).reduce((a,b)=>a+b,0);
                const mtdNps = npsWeeks.map(safeNum).reduce((a,b)=>a+b,0);
                const googReach = mtdInv > 0 && mtdGoog > 0 ? ((mtdGoog/mtdInv)*100).toFixed(1) : null;
                const npsReach = mtdInv > 0 && mtdNps > 0 ? ((mtdNps/mtdInv)*100).toFixed(1) : null;
                const combined = mtdInv > 0 && (mtdGoog+mtdNps) > 0 ? (((mtdGoog+mtdNps)/mtdInv)*100).toFixed(1) : null;
                return (
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
                    {[
                      { label:"Google Reach", val:googReach, color:C.blue },
                      { label:"NPS Reach", val:npsReach, color:C.amber },
                      { label:"Combined Reach", val:combined, color:C.gold },
                    ].map(({label,val,color}) => (
                      <div key={label} style={{ background:C.bg, borderRadius:8, padding:"12px 10px", textAlign:"center", border:`1px solid ${val ? color+"33" : C.border}` }}>
                        <div style={{ color:C.muted, fontSize:10, marginBottom:4 }}>{label}</div>
                        <div style={{ color: val ? color : C.muted, fontWeight:800, fontSize:20 }}>
                          {val ? `${val}%` : "—"}
                        </div>
                        <div style={{ color:C.muted, fontSize:10, marginTop:3 }}>of invoices</div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* HNI */}
          <HNICard entries={hniEntries} setEntries={setHniEntries} />
        </Section>

        {/* ── EXCEPTIONAL DISCOUNTS ── */}
        <Section label="Exceptional Discounts">
          <ExceptionalDiscountCard entries={discountEntries} setEntries={setDiscountEntries} />
        </Section>

        {/* ── TEAM TASKS ── */}
        <Section label="Team Tasks & Updates">
          {[
            { key: "greeshma", name: "Greeshma" },
            { key: "manish",   name: "Manish"   },
            { key: "shweta",   name: "Shweta"   },
            { key: "vidya",    name: "Vidya"    },
          ].map(({ key, name }) => (
            <PersonBlock
              key={key}
              name={name}
              tasks={tasks[key] || []}
              setTasks={setPersonTasks(key)}
            />
          ))}
        </Section>

        {/* ── IDS ── */}
        <Section label="IDS — Issues & Opportunities">
          <div style={{ color: C.muted, fontSize: 11, marginBottom: 12 }}>Identify → Discuss → Solve</div>
          {idsKeys.map((_, i) => <IDSItem key={i} index={i} onRemove={() => removeIDS(i)} />)}
          <button onClick={addIDS} style={{
            background: "none", border: `1px dashed ${C.gold}`, color: C.gold,
            borderRadius: 8, padding: "8px 0", cursor: "pointer", fontSize: 12,
            width: "100%", letterSpacing: 0.5
          }}>+ Add Issue / Opportunity</button>
        </Section>

        {/* ── MERCH GAPS ── */}
        <Section label="Merch Gaps">
          <TA placeholder="Out of stock, display gaps, replenishment needed…" value={notes.merch} onChange={setN("merch")} />
        </Section>

        {/* ── CUSTOMER FOLLOW-UPS ── */}
        <Section label="Customer Follow-ups">
          <TA placeholder="Name — item of interest — last contact — next action…" value={notes.followups} onChange={setN("followups")} />
        </Section>

        {/* ── WEEKLY CHECKLIST ── */}
        <Section label="Opening Checklist" badge={`${doneCount}/${checklist.length}`}>
          {checklist.map((item, i) => <CheckItem key={i} label={item} checked={checked[i]} onChange={() => toggleCheck(i)} />)}
          <div style={{ marginTop: 10, textAlign: "right", color: doneCount === checklist.length ? C.green : C.muted, fontSize: 12 }}>
            {doneCount === checklist.length ? "✅ All checks complete" : `${checklist.length - doneCount} remaining`}
          </div>
        </Section>

        {/* ── CLOSE OUT ── */}
        <Section label="Close Out">
          <TA placeholder="Decisions made, action items with owners & deadlines, next call date…" value={notes.closeout} onChange={setN("closeout")} />
          <div style={{
            marginTop: 14, padding: "12px 16px", background: C.surface, borderRadius: 8,
            border: `1px solid ${C.borderGold}`, fontSize: 12, color: C.muted
          }}>
            <span style={{ color: C.gold, fontWeight: 700 }}>Next Monday → </span>
            {(() => {
              const d = new Date();
              d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
              return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
            })()}
          </div>
        </Section>

      </div>
    </div>
  );
}
