import { chooseReportState } from "./media_report.ts";

const empty = { title: "Weekly", period: "2026-W44", assets: [] };
const played = { title: "Weekly", period: "2026-W44", assets: [{ creator: "Mina", media: "Session", plays: 1 }] };
if (chooseReportState(empty) !== "needs-assets") throw new Error("empty input should wait for media");
if (chooseReportState(played) !== "ready") throw new Error("played media should produce a report");
console.log("report decision test passed");
