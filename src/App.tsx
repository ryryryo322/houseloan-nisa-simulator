import { useState, useMemo, useCallback, useRef } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

// ─── helpers ────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  n >= 10000
    ? `${(n / 10000).toFixed(1)}億`
    : n >= 1
    ? `${n.toFixed(0)}万`
    : "0万";

const fmtM = (n: number) => `${Math.round(n).toLocaleString()}万円`;

// ─── types ──────────────────────────────────────────────────────────────────

interface Inputs {
  loanAmount: number;      // 万円
  rate: number;            // %
  loanYears: number;       // 年
  bonus: number;           // 万円/回
  nisaMonthly: number;     // 万円
  nisaReturn: number;      // %
  currentAsset: number;    // 万円
  currentAge: number;
  retireAge: number;
  income: number;          // 万円（年収）
}

interface YearPoint {
  age: number;
  loanBalance: number;
  nisaAsset: number;
  netAsset: number;
}

// ─── calculation ─────────────────────────────────────────────────────────────

function calculate(inp: Inputs) {
  const {
    loanAmount, rate, loanYears, bonus,
    nisaMonthly, nisaReturn, currentAsset,
    currentAge, retireAge, income,
  } = inp;

  // monthly payment (元利均等)
  const r = rate / 100 / 12;
  const n = loanYears * 12;
  const monthlyPayment =
    r > 0
      ? loanAmount * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1)
      : loanAmount / n;

  const totalPayment = monthlyPayment * n + bonus * 2 * loanYears;
  const completeAge = currentAge + loanYears;

  // year-by-year
  const years: YearPoint[] = [];
  let balance = loanAmount;
  let nisaAsset = currentAsset;
  const nr = nisaReturn / 100 / 12;

  const maxAge = Math.max(retireAge, completeAge) + 1;
  for (let age = currentAge; age <= maxAge; age++) {
    years.push({
      age,
      loanBalance: Math.max(0, Math.round(balance * 10) / 10),
      nisaAsset: Math.round(nisaAsset * 10) / 10,
      netAsset: Math.round((nisaAsset - Math.max(0, balance)) * 10) / 10,
    });

    // next year
    if (balance > 0) {
      for (let m = 0; m < 12; m++) {
        const interest = balance * (rate / 100 / 12);
        const principal = monthlyPayment - interest;
        balance = Math.max(0, balance - principal);
      }
      balance -= bonus * 2; // ボーナス年2回
      if (balance < 0) balance = 0;
    }
    for (let m = 0; m < 12; m++) {
      nisaAsset = nisaAsset * (1 + nr) + nisaMonthly;
    }
  }

  // events
  const events: { age: number; label: string; icon: string }[] = [];
  const milestones = [500, 1000, 2000, 3000, 5000];
  for (const ms of milestones) {
    const hit = years.find((y) => y.nisaAsset >= ms);
    if (hit && hit.age <= retireAge + 5)
      events.push({ age: hit.age, label: `NISA ${fmt(ms)}達成`, icon: "🎯" });
  }
  const crossAge = years.find((y) => y.nisaAsset >= Math.max(0, y.loanBalance) && y.loanBalance > 0);
  if (crossAge) events.push({ age: crossAge.age, label: "資産がローン残高を超える", icon: "⚡" });
  events.push({ age: completeAge, label: "住宅ローン完済", icon: "🏠" });
  const retirePoint = years.find((y) => y.age === retireAge);
  if (retirePoint)
    events.push({ age: retireAge, label: `資産 ${fmt(retirePoint.nisaAsset)}`, icon: "🎉" });

  events.sort((a, b) => a.age - b.age);
  const uniqueEvents = events.filter(
    (e, i, arr) => arr.findIndex((x) => x.age === e.age && x.label === e.label) === i
  );

  // risk
  const annualPayment = monthlyPayment * 12 + bonus * 2;
  const ratio = income > 0 ? annualPayment / income : 0;
  const risk = ratio < 0.25 ? "safe" : ratio < 0.35 ? "caution" : "danger";

  return {
    monthlyPayment,
    totalPayment,
    completeAge,
    finalNisa: retirePoint?.nisaAsset ?? 0,
    finalNet: retirePoint?.netAsset ?? 0,
    years,
    uniqueEvents,
    risk,
    annualPayment,
  };
}

// ─── sub-components ──────────────────────────────────────────────────────────

const SliderInput = ({
  label, value, min, max, step, unit, onChange,
}: {
  label: string; value: number; min: number; max: number;
  step: number; unit: string; onChange: (v: number) => void;
}) => (
  <div className="mb-5">
    <div className="flex justify-between items-baseline mb-1">
      <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{label}</span>
      <span className="text-base font-semibold text-gray-900 dark:text-white tabular-nums">
        {value.toLocaleString()}{unit}
      </span>
    </div>
    <input
      type="range" min={min} max={max} step={step} value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full h-1 bg-gray-200 dark:bg-gray-700 rounded-full appearance-none accent-blue-500 cursor-pointer"
    />
    <div className="flex justify-between text-xs text-gray-400 mt-0.5">
      <span>{min}{unit}</span><span>{max}{unit}</span>
    </div>
  </div>
);

const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`
    bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl
    rounded-2xl border border-white/60 dark:border-gray-700/60
    shadow-sm p-5 ${className}
  `}>
    {children}
  </div>
);

const SectionTitle = ({ children, color = "blue" }: { children: React.ReactNode; color?: string }) => {
  const colors: Record<string, string> = {
    blue: "bg-blue-500",
    green: "bg-green-500",
    purple: "bg-purple-500",
  } as const;
  return (
    <div className="flex items-center gap-3 mb-4 px-1">
      <div className={`w-1 h-5 rounded-full ${colors[color]}`} />
      <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 tracking-tight">
        {children}
      </h2>
      <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
    </div>
  );
};

const StatRow = ({
  label, value, highlight,
}: { label: string; value: string; highlight?: boolean }) => (
  <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
    <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
    <span className={`text-sm font-semibold tabular-nums ${highlight ? "text-blue-500" : "text-gray-900 dark:text-white"}`}>
      {value}
    </span>
  </div>
);

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur rounded-xl shadow-lg border border-gray-100 dark:border-gray-800 p-3 text-xs">
      <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1">{label}歳</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="tabular-nums">
          {p.name}: {fmtM(p.value)}
        </p>
      ))}
    </div>
  );
};

// ─── main ────────────────────────────────────────────────────────────────────

export default function App() {
  const [inp, setInp] = useState<Inputs>({
    loanAmount: 3500, rate: 1.5, loanYears: 35, bonus: 20,
    nisaMonthly: 5, nisaReturn: 5, currentAsset: 100,
    currentAge: 35, retireAge: 65, income: 500,
  });

  const set = useCallback((key: keyof Inputs) => (v: number) =>
    setInp((prev) => ({ ...prev, [key]: v })), []);

  const result = useMemo(() => calculate(inp), [inp]);

  const riskLabel = result.risk === "danger" ? "危険" : result.risk === "caution" ? "注意" : "安全";
  const riskColor = result.risk === "danger" ? "text-red-500" : result.risk === "caution" ? "text-amber-500" : "text-green-500";
  const riskBg = result.risk === "danger" ? "bg-red-50 dark:bg-red-900/20" : result.risk === "caution" ? "bg-amber-50 dark:bg-amber-900/20" : "bg-green-50 dark:bg-green-900/20";
  const riskBorder = result.risk === "danger" ? "border-red-200 dark:border-red-800" : result.risk === "caution" ? "border-amber-200 dark:border-amber-800" : "border-green-200 dark:border-green-800";

  const captureRef = useRef<HTMLDivElement>(null);

  const handleSave = async () => {
    const html2canvas = (await import("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.esm.min.js" as any)).default;
    if (!captureRef.current) return;
    const canvas = await html2canvas(captureRef.current, { scale: 2, useCORS: true });
    const link = document.createElement("a");
    link.download = "simulation.png";
    link.href = canvas.toDataURL();
    link.click();
  };

  // chart data — every 5 years for readability
  const chartData = result.years.filter((y) => y.age % 5 === 0 || y.age === inp.currentAge);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 font-sans antialiased">
      {/* header */}
      <header className="sticky top-0 z-50 bg-white/70 dark:bg-gray-950/70 backdrop-blur-xl border-b border-gray-200/60 dark:border-gray-800/60">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex flex-col leading-tight">
            <span className="text-base font-black text-gray-900 dark:text-white tracking-tight">いえとお金シミュレーター</span>
            <span className="text-xs text-gray-400 dark:text-gray-500 font-medium tracking-widest">— ローン返済 × NISA積立 —</span>
          </div>
          <button
            onClick={handleSave}
            className="text-xs font-medium text-blue-500 hover:text-blue-600 active:opacity-70 transition-opacity"
          >
            保存
          </button>
        </div>
      </header>

      <div ref={captureRef} className="max-w-2xl mx-auto px-4 py-8 space-y-10">

        {/* ── INPUTS ── */}
        <section>
          <SectionTitle color="blue">🏠 住宅ローン</SectionTitle>
          <Card>
            <SliderInput label="借入額" value={inp.loanAmount} min={0} max={8000} step={100} unit="万円" onChange={set("loanAmount")} />
            <SliderInput label="金利（年）" value={inp.rate} min={0.1} max={5} step={0.05} unit="%" onChange={set("rate")} />
            <SliderInput label="返済期間" value={inp.loanYears} min={10} max={50} step={1} unit="年" onChange={set("loanYears")} />
            <SliderInput label="ボーナス返済（年2回×）" value={inp.bonus} min={0} max={200} step={5} unit="万円" onChange={set("bonus")} />
          </Card>
        </section>

        <section>
          <SectionTitle color="green">📈 NISA</SectionTitle>
          <Card>
            <SliderInput label="毎月積立額" value={inp.nisaMonthly} min={0} max={30} step={0.5} unit="万円" onChange={set("nisaMonthly")} />
            <SliderInput label="想定利回り（年）" value={inp.nisaReturn} min={1} max={10} step={0.5} unit="%" onChange={set("nisaReturn")} />
            <SliderInput label="現在の保有資産" value={inp.currentAsset} min={0} max={3000} step={10} unit="万円" onChange={set("currentAsset")} />
          </Card>
        </section>

        <section>
          <SectionTitle color="purple">👤 あなたの情報</SectionTitle>
          <Card>
            <SliderInput label="現在の年齢" value={inp.currentAge} min={20} max={55} step={1} unit="歳" onChange={set("currentAge")} />
            <SliderInput label="リタイア予定年齢" value={inp.retireAge} min={50} max={75} step={1} unit="歳" onChange={set("retireAge")} />
            <SliderInput label="年収" value={inp.income} min={200} max={3000} step={50} unit="万円" onChange={set("income")} />
          </Card>
        </section>

        {/* ── RESULTS ── */}
        <section>
          <SectionTitle color="blue">📊 シミュレーション結果</SectionTitle>
          <Card>
            <StatRow label="毎月返済額" value={`${Math.round(result.monthlyPayment).toLocaleString()}万円`} highlight />
            <StatRow label="総返済額" value={fmtM(result.totalPayment)} />
            <StatRow label="ローン完済年齢" value={`${result.completeAge}歳`} />
            <StatRow label={`NISA最終資産（${inp.retireAge}歳）`} value={fmtM(result.finalNisa)} highlight />
            <StatRow label={`純資産（${inp.retireAge}歳）`} value={fmtM(result.finalNet)} />
          </Card>
        </section>

        {/* ── RISK ── */}
        <section>
          <SectionTitle color="blue">⚠️ 返済負担リスク診断</SectionTitle>
          <div className={`rounded-2xl border p-4 flex items-center gap-3 ${riskBg} ${riskBorder}`}>
            <span className={`text-2xl font-bold ${riskColor}`}>{riskLabel}</span>
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-snug">
              年間返済額 <span className="font-semibold text-gray-900 dark:text-white">{fmtM(result.annualPayment)}</span>　返済負担率 <span className="font-semibold text-gray-900 dark:text-white">{inp.income > 0 ? (result.annualPayment / inp.income * 100).toFixed(1) : "－"}%</span><br />
              25%未満：安全　25〜35%：注意　35%超：危険
            </p>
          </div>
        </section>

        {/* ── CHART 1 ── */}
        <section>
          <SectionTitle color="blue">📉 ローン残高 vs NISA資産</SectionTitle>
          <Card>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gLoan" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gNisa" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="age" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}歳`} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}万`} width={48} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="loanBalance" name="ローン残高" stroke="#ef4444" fill="url(#gLoan)" strokeWidth={2} isAnimationActive />
                <Area type="monotone" dataKey="nisaAsset" name="NISA資産" stroke="#3b82f6" fill="url(#gNisa)" strokeWidth={2} isAnimationActive />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        </section>

        {/* ── CHART 2 ── */}
        <section>
          <SectionTitle color="green">💰 純資産の推移</SectionTitle>
          <Card>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gNet" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="age" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}歳`} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}万`} width={48} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="netAsset" name="純資産" stroke="#10b981" fill="url(#gNet)" strokeWidth={2} isAnimationActive />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        </section>

        {/* ── TIMELINE ── */}
        <section>
          <SectionTitle color="purple">🗓 ライフイベント</SectionTitle>
          <Card className="py-4">
            <ol className="relative border-l border-gray-200 dark:border-gray-700 ml-3 space-y-0">
              {result.uniqueEvents.map((ev, i) => (
                <li key={i} className="mb-0 ml-5 pb-5 last:pb-0">
                  <span className="absolute -left-3 flex items-center justify-center w-6 h-6 bg-blue-50 dark:bg-blue-900/30 rounded-full text-sm border border-white dark:border-gray-900">
                    {ev.icon}
                  </span>
                  <div className="flex items-baseline gap-2 pt-0.5">
                    <span className="text-sm font-bold text-gray-900 dark:text-white tabular-nums w-10">{ev.age}歳</span>
                    <span className="text-sm text-gray-600 dark:text-gray-400">{ev.label}</span>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </section>

        {/* ── AFFILIATE ── */}
        <section>
          <SectionTitle color="green">✨ あなたにおすすめ</SectionTitle>
          <div className="space-y-3">

            {/* 住宅ローン */}
            <a
              href="https://YOUR_AFFILIATE_LINK_LOAN_HERE"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/60 dark:border-gray-700/60 shadow-sm p-4 active:opacity-70 transition-opacity"
            >
              <div className="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center text-2xl flex-shrink-0">
                🏦
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-blue-500 font-semibold mb-0.5">住宅ローン</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white leading-snug">
                  金利を比較して賢く借りよう
                </p>
                <p className="text-xs text-gray-400 mt-0.5">変動・固定の最新金利をチェック →</p>
              </div>
              <span className="text-gray-300 dark:text-gray-600 text-lg flex-shrink-0">›</span>
            </a>

            {/* NISA口座 */}
            <a
              href="https://px.a8.net/svt/ejp?a8mat=4B650H+AO0LYQ+1WP2+15ORS2"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/60 dark:border-gray-700/60 shadow-sm p-4 active:opacity-70 transition-opacity"
            >
              <div className="w-12 h-12 rounded-xl bg-green-500 flex items-center justify-center text-2xl flex-shrink-0">
                📈
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-green-500 font-semibold mb-0.5">株式取引</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white leading-snug">
                  DMM株ではじめる！株式取引
                </p>
                <p className="text-xs text-gray-400 mt-0.5">口座開設無料・手数料業界最安水準 →</p>
              </div>
              <span className="text-gray-300 dark:text-gray-600 text-lg flex-shrink-0">›</span>
            </a>

            {/* FP相談 */}
            <a
              href="https://YOUR_AFFILIATE_LINK_FP_HERE"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/60 dark:border-gray-700/60 shadow-sm p-4 active:opacity-70 transition-opacity"
            >
              <div className="w-12 h-12 rounded-xl bg-purple-500 flex items-center justify-center text-2xl flex-shrink-0">
                💬
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-purple-500 font-semibold mb-0.5">無料FP相談</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white leading-snug">
                  プロに相談してマネープランを最適化
                </p>
                <p className="text-xs text-gray-400 mt-0.5">オンラインで何度でも無料 →</p>
              </div>
              <span className="text-gray-300 dark:text-gray-600 text-lg flex-shrink-0">›</span>
            </a>

          </div>
          <p className="text-center text-xs text-gray-400 dark:text-gray-600 mt-3">
            ※ 広告・PR を含みます
          </p>
        </section>

        {/* footer */}
        <p className="text-center text-xs text-gray-400 dark:text-gray-600 pb-4">
          ※本シミュレーションは参考値です。実際の数値は金融機関にご確認ください。
        </p>
      </div>
    </div>
  );
}
