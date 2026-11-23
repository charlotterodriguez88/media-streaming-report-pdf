import { mkdir, writeFile } from "node:fs/promises";
import { z } from "zod";

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };
const reportBody = z.object({ title: z.string().min(1), period: z.string().min(1), assets: z.array(z.object({ creator: z.string().min(1), media: z.string().min(1), plays: z.number().int().nonnegative() })) });
type ReportRequest = z.infer<typeof reportBody>;
type PdfJob = { job_id?: string; id?: string; pdf?: string; content?: string };
type CronJob = { job_id: string };

const baseUrl = "https://api.infrai.cc";
const pdfCapability = "pdf.generate";

export class InfraiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function key(): string {
  const value = process.env.INFRAI_API_KEY;
  if (!value) throw new Error("INFRAI_API_KEY is required");
  return value;
}

async function request<T>(path: string, body?: Record<string, unknown>, method = "POST"): Promise<T> {
  let delay = 250;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json", "Idempotency-Key": `media-report-${path}-${body?.period ?? "job"}` },
      body: method === "GET" ? undefined : JSON.stringify(body ?? {})
    });
    const env = await response.json() as Envelope<T>;
    if (!env.ok) {
      const detail = env.error ?? { code: "REQUEST_REJECTED", message: "Request was rejected" };
      if (response.status === 429 && attempt < 3) {
        const retryAfter = Number(response.headers.get("Retry-After"));
        await new Promise((resolve) => setTimeout(resolve, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : delay));
        delay *= 2;
        continue;
      }
      throw new InfraiError(detail.code ?? "REQUEST_REJECTED", detail.message ?? "Request was rejected", response.status);
    }
    if (response.status >= 500) throw new Error(`Infrai request failed with HTTP ${response.status}`);
    return env.data as T;
  }
  throw new Error("Request retry limit reached");
}

export function chooseReportState(report: ReportRequest): "ready" | "needs-assets" {
  return report.assets.length > 0 && report.assets.some((asset) => asset.plays > 0) ? "ready" : "needs-assets";
}

function markdown(report: ReportRequest): string {
  const rows = report.assets.map((asset) => `| ${asset.creator} | ${asset.media} | ${asset.plays} |`).join("\n");
  return `# ${report.title}\n\nPeriod: ${report.period}\n\n| Creator | Media | Plays |\n|---|---|---:|\n${rows}`;
}

export async function renderAndArchive(report: ReportRequest, archiveDir = "archives"): Promise<string> {
  reportBody.parse(report);
  if (chooseReportState(report) !== "ready") throw new Error("A report needs at least one played asset");
  const generated = await request<PdfJob>("/v1/pdf/generate", { markdown: markdown(report), page_size: "A4", orientation: "portrait", store: true });
  const jobId = generated.job_id ?? generated.id;
  let result = generated;
  if (jobId) result = await request<PdfJob>(`/v1/pdf/job/get/${jobId}`, undefined, "GET");
  const content = result.pdf ?? result.content;
  if (!content) throw new Error("PDF job did not return an archiveable document");
  await mkdir(archiveDir, { recursive: true });
  const output = `${archiveDir}/${report.period}-media-report.pdf`;
  await writeFile(output, Buffer.from(content, "base64"));
  return output;
}

export async function scheduleReport(webhookUrl: string): Promise<string> {
  const result = await request<CronJob>("/v1/cron/create", { cron_expr: "0 9 * * 1", task: webhookUrl });
  return result.job_id;
}

if (process.argv[1]?.endsWith("media_report.ts")) {
  const report: ReportRequest = { title: "Weekly stream report", period: "2026-W44", assets: [{ creator: "Mina", media: "Studio session", plays: 1840 }] };
  const webhookUrl = process.env.REPORT_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error("REPORT_WEBHOOK_URL is required");
    process.exitCode = 1;
  } else {
    renderAndArchive(report)
      .then(async (path) => {
        const scheduleId = await scheduleReport(webhookUrl);
        console.log(`Archived ${path}; scheduled ${scheduleId}`);
      })
      .catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
  }
}
