"use client";

import { signOut } from "next-auth/react";
import { useMemo, useState } from "react";

import { rangeToParams } from "@/lib/time-range";
import { useEndpoint } from "@/lib/use-endpoint";

type Row = Record<string, string | number | null>;

const RANGES = [1, 7, 30, 90] as const;
const nf = new Intl.NumberFormat("en-US");

const fmt = (value: string | number | null | undefined): string =>
  typeof value === "number" ? nf.format(Math.round(value * 100) / 100) : (value ?? "—");

const Panel = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="panel">
    <h2>{title}</h2>
    {children}
  </section>
);

const Status = ({ loading, error, empty }: { loading: boolean; error?: string; empty: boolean }) =>
  error ? <p className="error">{error}</p> : loading ? <p className="muted">Loading…</p> : empty ? <p className="muted">No data</p> : null;

const RankedTable = ({
  endpoint,
  params,
  labelKey,
  heading,
}: {
  endpoint: string;
  params: Record<string, string | undefined>;
  labelKey: string;
  heading: string;
}) => {
  const { data, loading, error } = useEndpoint<Row>(endpoint, params);
  const max = Math.max(1, ...(data ?? []).map((row) => Number(row.visits ?? 0)));
  return (
    <Panel title={heading}>
      <Status loading={loading} error={error} empty={data?.length === 0} />
      <table>
        <tbody>
          {(data ?? []).slice(0, 10).map((row) => (
            <tr key={String(row[labelKey])}>
              <td className="label">
                <span className="bar" style={{ width: `${(Number(row.visits ?? 0) / max) * 100}%` }} />
                <span className="text">{fmt(row[labelKey]) || "(direct)"}</span>
              </td>
              <td className="num">{fmt(row.visits)}</td>
              <td className="num muted">{fmt(row.hits)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
};

const Kpis = ({ params }: { params: Record<string, string | undefined> }) => {
  const { data, loading, error } = useEndpoint<Row>("kpis", params);
  const rows = data ?? [];
  const sum = (key: string) => rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
  const visits = sum("visits");
  const avg = (key: string) => (rows.length === 0 ? 0 : sum(key) / rows.length);
  const max = Math.max(1, ...rows.map((row) => Number(row.visits ?? 0)));
  return (
    <>
      <div className="cards">
        <div className="card"><span>Visits</span><strong>{fmt(visits)}</strong></div>
        <div className="card"><span>Pageviews</span><strong>{fmt(sum("pageviews"))}</strong></div>
        <div className="card"><span>Bounce rate</span><strong>{fmt(Math.round(avg("bounce_rate") * 100))}%</strong></div>
        <div className="card"><span>Avg session</span><strong>{fmt(Math.round(avg("avg_session_sec")))}s</strong></div>
      </div>
      <Panel title="Visits per day">
        <Status loading={loading} error={error} empty={rows.length === 0} />
        <div className="chart" role="img" aria-label="Visits per day">
          {rows.map((row) => (
            <div key={String(row.date)} className="col" title={`${row.date}: ${fmt(row.visits)}`}>
              <div style={{ height: `${(Number(row.visits ?? 0) / max) * 100}%` }} />
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
};

const CurrentVisitors = ({ domain }: { domain: string | undefined }) => {
  const { data } = useEndpoint<Row>("current_visitors", { domain });
  return <span className="live">● {fmt(data?.[0]?.visits ?? 0)} online</span>;
};

const VITALS_ORDER = ["LCP", "INP", "CLS", "FCP", "TTFB"];

const SpeedInsights = ({ params }: { params: Record<string, string | undefined> }) => {
  const vitals = useEndpoint<Row>("web_vitals_current", { domain: params.domain, days: params.days });
  const routes = useEndpoint<Row>("web_vitals_routes", { domain: params.domain, days: params.days, sort_order: "asc", limit: "10" });
  const ordered = [...(vitals.data ?? [])].sort(
    (a, b) =>
      String(a.domain).localeCompare(String(b.domain)) ||
      VITALS_ORDER.indexOf(String(a.metric_name)) - VITALS_ORDER.indexOf(String(b.metric_name)),
  );
  const multiDomain = new Set(ordered.map((row) => row.domain)).size > 1;
  return (
    <>
      <Panel title="Core Web Vitals">
        <Status loading={vitals.loading} error={vitals.error} empty={ordered.length === 0} />
        <div className="cards">
          {ordered.map((row) => (
            <div key={`${row.domain}-${row.metric_name}`} className={`card status-${row.status}`}>
              <span>{row.metric_name} p75{multiDomain ? ` · ${row.domain}` : ""}</span>
              <strong>{fmt(row.p75)} <small>{row.units}</small></strong>
              <em>{row.status}</em>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Slowest routes (worst first)">
        <Status loading={routes.loading} error={routes.error} empty={routes.data?.length === 0} />
        <table>
          <thead><tr><th>Route</th><th className="num">Score</th><th className="num">LCP ms</th><th className="num">INP ms</th><th className="num">CLS</th></tr></thead>
          <tbody>
            {(routes.data ?? []).map((row) => (
              <tr key={`${row.domain}-${row.route}`}>
                <td>{fmt(row.route)}</td><td className="num">{fmt(row.overall_score)}</td>
                <td className="num">{fmt(row.lcp_avg)}</td><td className="num">{fmt(row.inp_avg)}</td><td className="num">{fmt(row.cls_avg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  );
};

export const Dashboard = ({ email }: { email: string }) => {
  const [days, setDays] = useState<number>(7);
  const [domain, setDomain] = useState<string>("");
  const [tab, setTab] = useState<"analytics" | "speed">("analytics");
  const domains = useEndpoint<Row>("domains", {});
  const params = useMemo(
    () => ({
      ...rangeToParams({ days }, new Date()),
      domain: domain || undefined,
      include_previous_period: undefined,
    }),
    [days, domain],
  );

  return (
    <div className="app">
      <header>
        <h1>Web Analytics</h1>
        <CurrentVisitors domain={domain || undefined} />
        <span className="spacer" />
        <select aria-label="Domain" value={domain} onChange={(e) => setDomain(e.target.value)}>
          <option value="">All domains</option>
          {(domains.data ?? []).map((row) => (
            <option key={String(row.domain)} value={String(row.domain)}>{String(row.domain)}</option>
          ))}
        </select>
        <select aria-label="Time range" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {RANGES.map((value) => (
            <option key={value} value={value}>{value === 1 ? "Today" : `Last ${value} days`}</option>
          ))}
        </select>
        <button onClick={() => void signOut({ callbackUrl: "/login" })}>{email} · Sign out</button>
      </header>
      <nav>
        <button aria-pressed={tab === "analytics"} onClick={() => setTab("analytics")}>Analytics</button>
        <button aria-pressed={tab === "speed"} onClick={() => setTab("speed")}>Speed Insights</button>
      </nav>
      <main>
        {tab === "analytics" ? (
          <>
            <Kpis params={params} />
            <div className="grid">
              <RankedTable endpoint="top_pages" params={params} labelKey="pathname" heading="Top pages" />
              <RankedTable endpoint="top_sources" params={params} labelKey="referrer" heading="Top sources" />
              <RankedTable endpoint="top_locations" params={params} labelKey="location" heading="Top locations" />
              <RankedTable endpoint="top_devices" params={params} labelKey="device" heading="Devices" />
              <RankedTable endpoint="top_browsers" params={params} labelKey="browser" heading="Browsers" />
            </div>
          </>
        ) : (
          <SpeedInsights params={params} />
        )}
      </main>
    </div>
  );
};
