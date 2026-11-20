import type {
  AnalysisResult,
  Category,
  DiagnosticFinding,
  Severity
} from "../types/analysis";

export const SEVERITY_ORDER: readonly Severity[] = [
  "Critical",
  "High",
  "Medium",
  "Low"
] as const;

export const SEVERITY_COLOR: Record<Severity, string> = {
  Critical: "#FF453A",
  High: "#FF9F0A",
  Medium: "#FFD60A",
  Low: "#30D158"
};

export function getScoreColor(score: number): string {
  if (score >= 75) return "#30D158";
  if (score >= 50) return "#FFD60A";
  return "#FF453A";
}

export function getScoreLabel(score: number): string {
  if (score >= 75) return "Healthy";
  if (score >= 50) return "Attention";
  return "Critical";
}

export function clampScore(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.max(0, Math.min(100, Math.round(val)));
}

export interface RadarAxisPoint {
  category: Category;
  label: string;
  score: number;
  count: number;
}

const SEVERITY_WEIGHT: Record<Severity, number> = {
  Critical: 28,
  High: 18,
  Medium: 11,
  Low: 5
};

export function deriveRadarAxes(result: AnalysisResult): RadarAxisPoint[] {
  const report = result.final_report;
  const findings = report.findings ?? [];

  const byCat: Record<Category, DiagnosticFinding[]> = {
    Security: [],
    Architecture: [],
    Efficiency: [],
    Syntax: []
  };

  for (const f of findings) {
    if (f.category in byCat) {
      byCat[f.category].push(f);
    }
  }

  const penaltyFor = (items: DiagnosticFinding[]): number =>
    items.reduce((acc, item) => acc + (SEVERITY_WEIGHT[item.diagnostic.severity] ?? 10), 0);

  const securityScore = clampScore(report.security_score);
  const architectureScore = clampScore(report.architecture_score);

  const efficiencyScore =
    typeof report.efficiency_score === "number"
      ? clampScore(report.efficiency_score)
      : clampScore(100 - penaltyFor(byCat.Efficiency));

  const syntaxScore =
    typeof report.syntax_score === "number"
      ? clampScore(report.syntax_score)
      : clampScore(100 - penaltyFor(byCat.Syntax));

  return [
    {
      category: "Security",
      label: "Security",
      score: securityScore,
      count: byCat.Security.length
    },
    {
      category: "Architecture",
      label: "Architecture",
      score: architectureScore,
      count: byCat.Architecture.length
    },
    {
      category: "Efficiency",
      label: "Efficiency",
      score: efficiencyScore,
      count: byCat.Efficiency.length
    },
    {
      category: "Syntax",
      label: "Syntax",
      score: syntaxScore,
      count: byCat.Syntax.length
    }
  ];
}

export interface SeverityBucket {
  severity: Severity;
  count: number;
  color: string;
}

export function deriveSeverityBuckets(findings: DiagnosticFinding[]): SeverityBucket[] {
  const counts: Record<Severity, number> = {
    Critical: 0,
    High: 0,
    Medium: 0,
    Low: 0
  };
  for (const f of findings) {
    if (f.diagnostic.severity in counts) {
      counts[f.diagnostic.severity] += 1;
    }
  }
  return SEVERITY_ORDER.map((severity) => ({
    severity,
    count: counts[severity],
    color: SEVERITY_COLOR[severity]
  }));
}

export interface FileHotspot {
  filePath: string;
  count: number;
  worstSeverity: Severity;
}

const SEVERITY_RANK: Record<Severity, number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1
};

export function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\.?\//, "").trim();
}

export function pathsMatch(a: string, b: string): boolean {
  const na = normalizePath(a);
  const nb = normalizePath(b);
  if (na === nb) return true;
  return na.endsWith(`/${nb}`) || nb.endsWith(`/${na}`);
}

export function deriveFileHotspots(
  findings: DiagnosticFinding[],
  selectedFiles: string[]
): FileHotspot[] {
  const map = new Map<string, { count: number; worstSeverity: Severity }>();

  for (const f of findings) {
    const key = normalizePath(f.diagnostic.file_path);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { count: 1, worstSeverity: f.diagnostic.severity });
    } else {
      existing.count += 1;
      if (SEVERITY_RANK[f.diagnostic.severity] > SEVERITY_RANK[existing.worstSeverity]) {
        existing.worstSeverity = f.diagnostic.severity;
      }
    }
  }

  for (const sf of selectedFiles) {
    const key = normalizePath(sf);
    if (!map.has(key)) {
      map.set(key, { count: 0, worstSeverity: "Low" });
    }
  }

  return Array.from(map.entries())
    .map(([filePath, meta]) => ({
      filePath,
      count: meta.count,
      worstSeverity: meta.worstSeverity
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.filePath.localeCompare(b.filePath);
    })
    .slice(0, 6);
}

export function formatLineBadge(lineStart: number | null, lineEnd: number | null): string {
  if (lineStart !== null && lineEnd !== null && lineEnd !== lineStart) {
    return `L${lineStart}-L${lineEnd}`;
  }
  if (lineStart !== null) {
    return `L${lineStart}`;
  }
  return "FILE";
}

export function getFindingKey(finding: DiagnosticFinding, index: number): string {
  const d = finding.diagnostic;
  return `${normalizePath(d.file_path)}:${d.line_start ?? 0}:${d.flaw_type}:${index}`;
}

export function formatRepoSlug(repoUrl: string): string {
  try {
    const parsed = new URL(repoUrl);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]}/${parts[1]?.replace(/\.git$/, "")}`;
    }
  } catch {
    // Fallback to raw string
  }
  return repoUrl;
}
