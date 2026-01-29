import { v4 } from "uuid";
import { AreaChart, BarChart, DonutChart, Legend, LineChart } from "@tremor/react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Funnel,
  FunnelChart,
  Line,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Treemap,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Colors, getTremorColor } from "./chart-utils.js";
import CustomCell from "./CustomCell.jsx";
import Tooltip from "./CustomTooltip.jsx";
import { safeJsonParse } from "@/utils/request.js";
import renderMarkdown from "@/utils/chat/markdown.js";
import { WorkspaceProfileImage } from "../PromptReply/index.jsx";
import { memo, useCallback, useMemo, useState } from "react";
import { saveAs } from "file-saver";
import { useGenerateImage } from "recharts-to-png";
import { CircleNotch, DownloadSimple } from "@phosphor-icons/react";

/**
 * Chartable expects props.content to be either:
 * - an object, or
 * - a JSON string representing an object
 *
 * Tool contract (from rechart.js) includes:
 * - type, title, dataset (array OR JSON-string array)
 * - xAxisKey, seriesKeys
 * - layout, sort, valueFormat, topN, theme, caption
 */

function clamp(min, v, max) {
  return Math.max(min, Math.min(max, v));
}

function isFiniteNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

function coerceDataset(dataset) {
  if (Array.isArray(dataset)) return dataset;
  if (typeof dataset === "string") return safeJsonParse(dataset, []);
  return [];
}

function guessMapping({ data, xAxisKey, seriesKeys }) {
  const row = Array.isArray(data) && data.length ? data[0] : null;
  const keys = row ? Object.keys(row) : [];

  const fallbackXAxis =
    xAxisKey ||
    (keys.find((k) => k.toLowerCase() === "name") ?? keys.find((k) => typeof row?.[k] === "string") ?? "name");

  const numericKeys = keys.filter((k) => k !== fallbackXAxis && isFiniteNumber(row?.[k]));
  const fallbackSeries = Array.isArray(seriesKeys) && seriesKeys.length ? seriesKeys : numericKeys;

  return {
    xKey: fallbackXAxis,
    series: fallbackSeries.length ? fallbackSeries : ["value"],
    primary: (fallbackSeries.length ? fallbackSeries : ["value"])[0],
  };
}

function makeValueFormatter(valueFormat, currency = "USD") {
  // Keep this intentionally simple; can be expanded later.
  if (valueFormat === "integer") {
    return (n) => (isFiniteNumber(n) ? Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n) : String(n ?? ""));
  }
  if (valueFormat === "percent") {
    return (n) => {
      if (!isFiniteNumber(n)) return String(n ?? "");
      // Accept both 0-1 and 0-100 inputs
      const pct = n > 1 ? n : n * 100;
      return `${Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(pct)}%`;
    };
  }
  if (valueFormat === "currency") {
    return (n) => {
      if (!isFiniteNumber(n)) return String(n ?? "");
      return Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
    };
  }
  // number (default)
  return (n) => (isFiniteNumber(n) ? Intl.NumberFormat("en-US").format(n) : String(n ?? ""));
}

function normalizeRows({ data, xKey, primaryKey, sort, topN }) {
  let rows = Array.isArray(data) ? [...data] : [];

  // Remove bad rows (missing x or value)
  rows = rows.filter((r) => r && r[xKey] != null && r[primaryKey] != null);

  // Coerce numbers for sorting where possible
  const getVal = (r) => (isFiniteNumber(r[primaryKey]) ? r[primaryKey] : Number(r[primaryKey]));

  if (sort === "asc" || sort === "desc") {
    rows.sort((a, b) => {
      const av = getVal(a);
      const bv = getVal(b);
      if (!Number.isFinite(av) || !Number.isFinite(bv)) return 0;
      return sort === "asc" ? av - bv : bv - av;
    });
  }

  if (Number.isInteger(topN) && topN > 0) rows = rows.slice(0, topN);

  return rows;
}

function calcYAxisWidth(rows, xKey) {
  // Simple heuristic: ~7px per char + padding.
  const maxLen = rows.reduce((m, r) => Math.max(m, String(r?.[xKey] ?? "").length), 0);
  return clamp(120, 40 + maxLen * 7, 240);
}

function Chartable({ props, workspace }) {
  const [getDivJpeg, { ref }] = useGenerateImage({
    quality: 1,
    type: "image/jpeg",
    options: { backgroundColor: "#393d43", padding: 20 },
  });

  const handleDownload = useCallback(async () => {
    const jpeg = await getDivJpeg();
    if (jpeg) saveAs(jpeg, `chart-${v4().split("-")[0]}.jpg`);
  }, [getDivJpeg]);

  const content = useMemo(() => {
    return typeof props?.content === "string" ? safeJsonParse(props.content, null) : props?.content;
  }, [props?.content]);

  if (!content) return null;

  const chartType = String(content?.type ?? "").toLowerCase();
  const rawData = coerceDataset(content?.dataset);
  const mapping = useMemo(
    () => guessMapping({ data: rawData, xAxisKey: content?.xAxisKey, seriesKeys: content?.seriesKeys }),
    [rawData, content?.xAxisKey, content?.seriesKeys]
  );

  const sort = (content?.sort ?? "desc").toLowerCase(); // none|asc|desc (tool supports)
  const topN = Number.isInteger(content?.topN) ? content.topN : 10;

  const data = useMemo(
    () => normalizeRows({ data: rawData, xKey: mapping.xKey, primaryKey: mapping.primary, sort, topN }),
    [rawData, mapping.xKey, mapping.primary, sort, topN]
  );

  const title = content?.title ?? "";
  const caption = content?.caption ?? "";
  const theme = String(content?.theme ?? "professional").toLowerCase();
  const layout = String(content?.layout ?? "").toLowerCase(); // horizontal|vertical|"" (auto)
  const valueFormat = String(content?.valueFormat ?? "number").toLowerCase();
  const currency = content?.currency ?? "USD";
  const valueFormatter = useMemo(() => makeValueFormatter(valueFormat, currency), [valueFormat, currency]);

  const showLegend = content?.showLegend ?? true;
  const color = content?.color ?? null;

  const yAxisWidth = useMemo(() => calcYAxisWidth(data, mapping.xKey), [data, mapping.xKey]);

  const barHeightPx = useMemo(() => {
    // Nice default: 10 bars ~ 340px, 15 bars ~ 480px
    return clamp(260, data.length * 32 + 40, 520);
  }, [data.length]);

  const isHorizontalBar = useMemo(() => {
    if (layout === "horizontal") return true;
    if (layout === "vertical") return false;

    // auto: long labels => horizontal bar
    const avgLen = data.length
      ? data.reduce((acc, r) => acc + String(r?.[mapping.xKey] ?? "").length, 0) / data.length
      : 0;
    return avgLen > 12;
  }, [layout, data, mapping.xKey]);

  const customTooltip = useCallback(
    (ttProps) => <Tooltip {...ttProps} legendColor={getTremorColor(color || "blue")} valueFormatter={valueFormatter} />,
    [color, valueFormatter]
  );

  const renderCaption = () => {
    if (!caption) return null;
    return (
      <div
        className="mt-3 text-sm text-theme-text-secondary"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(caption) }}
      />
    );
  };

  const wrapCard = (children, extraClass = "") => (
    <div className={`bg-theme-bg-primary p-8 rounded-xl text-white light:border light:border-theme-border-primary ${extraClass}`}>
      {!!title && <h3 className="text-lg text-theme-text-primary font-medium">{title}</h3>}
      {children}
      {renderCaption()}
    </div>
  );

  const renderChart = () => {
    const tremorColor = color || "blue";
    const series = mapping.series;

    switch (chartType) {
      case "area":
        return wrapCard(
          <div className="mt-3" style={{ height: 350 }}>
            <AreaChart
              className="h-full"
              data={data}
              index={mapping.xKey}
              categories={series}
              colors={[tremorColor, "cyan"]}
              showLegend={showLegend}
              valueFormatter={valueFormatter}
              customTooltip={customTooltip}
            />
          </div>
        );

      case "bar":
        return wrapCard(
          <div className="mt-3" style={{ height: barHeightPx }}>
            <BarChart
              className="h-full"
              data={data}
              index={mapping.xKey}
              categories={series}
              colors={[tremorColor]}
              showLegend={showLegend}
              valueFormatter={valueFormatter}
              customTooltip={customTooltip}
              layout={isHorizontalBar ? "vertical" : "horizontal"}
              yAxisWidth={isHorizontalBar ? yAxisWidth : 60}
            />
          </div>
        );

      case "line":
        return wrapCard(
          <div className="mt-3" style={{ height: 400 }}>
            <LineChart
              className="h-full"
              data={data}
              index={mapping.xKey}
              categories={series}
              colors={[tremorColor]}
              showLegend={showLegend}
              valueFormatter={valueFormatter}
              customTooltip={customTooltip}
            />
          </div>
        );

      case "pie":
        // Map data to Tremor DonutChart format (name + value)
        return wrapCard(
          <div className="mt-6 flex flex-col gap-y-4">
            <DonutChart
              data={data}
              category={mapping.primary}
              index={mapping.xKey}
              valueFormatter={valueFormatter}
              colors={[tremorColor]}
              className="h-72"
            />
            {showLegend && (
              <Legend categories={[mapping.primary]} colors={[tremorColor]} className="justify-end" />
            )}
          </div>
        );

      case "composed": {
        // Recharts version: responsive + mapped keys
        const chartLayout = isHorizontalBar ? "vertical" : "horizontal";
        return wrapCard(
          <div className="mt-4" style={{ width: "100%", height: 360 }}>
            <ResponsiveContainer>
              <ComposedChart
                data={data}
                layout={chartLayout}
                margin={{ top: 10, right: 20, bottom: isHorizontalBar ? 10 : 30, left: isHorizontalBar ? 10 : 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                {isHorizontalBar ? (
                  <>
                    <XAxis type="number" tickFormatter={valueFormatter} tickLine={false} axisLine={false} />
                    <YAxis
                      type="category"
                      dataKey={mapping.xKey}
                      width={yAxisWidth}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => String(v)}
                    />
                  </>
                ) : (
                  <>
                    <XAxis
                      dataKey={mapping.xKey}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                      tick={{ transform: "translate(0, 6)", fill: "white" }}
                      style={{ fontSize: "12px", fontFamily: "Inter; Helvetica" }}
                      padding={{ left: 10, right: 10 }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ transform: "translate(-3, 0)", fill: "white" }}
                      style={{ fontSize: "12px", fontFamily: "Inter; Helvetica" }}
                      tickFormatter={valueFormatter}
                    />
                  </>
                )}
                <Bar dataKey={mapping.primary} fill={Colors[tremorColor] ?? Colors.blue} radius={[6, 6, 0, 0]} />
                <Line
                  type="monotone"
                  dataKey={mapping.primary}
                  stroke={Colors[tremorColor] ?? Colors.blue}
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        );
      }

      case "scatter":
        return wrapCard(
          <div className="mt-4" style={{ width: "100%", height: 360 }}>
            <ResponsiveContainer>
              <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey={mapping.xKey} tickLine={false} axisLine={false} />
                <YAxis dataKey={mapping.primary} tickLine={false} axisLine={false} tickFormatter={valueFormatter} />
                <Scatter data={data} fill={Colors[tremorColor] ?? Colors.blue} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        );

      case "radar":
        return wrapCard(
          <div className="mt-4" style={{ width: "100%", height: 360 }}>
            <ResponsiveContainer>
              <RadarChart data={data}>
                <PolarGrid />
                <PolarAngleAxis dataKey={mapping.xKey} />
                <PolarRadiusAxis tickFormatter={valueFormatter} />
                <Radar
                  name={mapping.primary}
                  dataKey={mapping.primary}
                  stroke={Colors[tremorColor] ?? Colors.blue}
                  fill={Colors[tremorColor] ?? Colors.blue}
                  fillOpacity={0.35}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        );

      case "radialbar":
        return wrapCard(
          <div className="mt-4" style={{ width: "100%", height: 360 }}>
            <ResponsiveContainer>
              <RadialBarChart innerRadius="20%" outerRadius="80%" data={data} startAngle={90} endAngle={-270}>
                <RadialBar
                  minAngle={15}
                  background
                  clockWise
                  dataKey={mapping.primary}
                  fill={Colors[tremorColor] ?? Colors.blue}
                />
              </RadialBarChart>
            </ResponsiveContainer>
          </div>
        );

      case "treemap":
        return wrapCard(
          <div className="mt-4" style={{ width: "100%", height: 420 }}>
            <ResponsiveContainer>
              <Treemap
                data={data}
                dataKey={mapping.primary}
                nameKey={mapping.xKey}
                stroke="#fff"
                fill={Colors[tremorColor] ?? Colors.blue}
                content={<CustomCell />}
              />
            </ResponsiveContainer>
          </div>
        );

      case "funnel":
        return wrapCard(
          <div className="mt-4" style={{ width: "100%", height: 380 }}>
            {showLegend && (
              <div className="flex justify-end">
                <Legend
                  categories={[mapping.primary]}
                  colors={[tremorColor, tremorColor]}
                  className="mb-5"
                />
              </div>
            )}
            <ResponsiveContainer>
              <FunnelChart>
                <RechartsTooltip
                  formatter={(v) => valueFormatter(Number(v))}
                  labelFormatter={(l) => String(l)}
                />
                <Funnel
                  dataKey={mapping.primary}
                  data={data}
                  isAnimationActive
                />
              </FunnelChart>
            </ResponsiveContainer>
          </div>
        );

      default:
        return wrapCard(<p className="mt-3 text-theme-text-secondary">Unsupported chart type: {chartType}</p>);
    }
  };

  // Existing UI wrapper (chat vs non-chat)
  if (!!props?.chatId) {
    return (
      <div className="flex justify-center items-end w-full">
        <div className="py-2 px-4 w-full flex gap-x-5 md:max-w-[80%] flex-col">
          <div className="flex gap-x-5">
            <WorkspaceProfileImage workspace={workspace} />
            <div className="relative w-full">
              <DownloadGraph onClick={handleDownload} />
              <div ref={ref}>{renderChart()}</div>
              {content?.reply && (
                <div
                  className="mt-3 text-sm text-theme-text-primary"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(content.reply) }}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-center items-end w-full">
      <div className="py-2 px-4 w-full flex gap-x-5 md:max-w-[80%] flex-col">
        <div className="relative w-full">
          <DownloadGraph onClick={handleDownload} />
          <div ref={ref}>{renderChart()}</div>
          {content?.reply && (
            <div
              className="mt-3 text-sm text-theme-text-primary"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(content.reply) }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function DownloadGraph({ onClick }) {
  const [loading, setLoading] = useState(false);
  const handleClick = async () => {
    setLoading(true);
    await onClick?.();
    setLoading(false);
  };

  return (
    <div className="absolute top-3 right-3 z-50 cursor-pointer">
      <div className="flex flex-col items-center">
        <div className="p-1 rounded-full border-none">
          {loading ? (
            <CircleNotch
              className="text-theme-text-primary w-5 h-5 animate-spin"
              aria-label="Downloading image..."
            />
          ) : (
            <DownloadSimple
              weight="bold"
              className="text-theme-text-primary w-5 h-5 hover:text-theme-text-primary"
              onClick={handleClick}
              aria-label="Download graph image"
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(Chartable);
