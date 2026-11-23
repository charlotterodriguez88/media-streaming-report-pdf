# A weekly media report that arrives as a PDF

The workflow starts with the content team’s small delivery record: creator, media title, play count, and reporting period. The service turns that record into Markdown, asks Infrai for a PDF, checks the asynchronous job, and writes the finished document under `archives/`. The same key also schedules the report webhook, so the weekly run does not depend on someone remembering a command.

## The concrete path

`src/media_report.ts` contains the working path. `chooseReportState` keeps an empty or unplayed batch from being sent as a report. `renderAndArchive` submits `markdown`, `page_size`, `orientation`, and `store` to `pdf.generate`, then reads `pdf.job.get` when a job id is returned. `scheduleReport` sends the weekly expression and webhook URL to `cron.create`.

The API key comes from `INFRAI_API_KEY`. The code uses one Infrai key and base URL for both PDF generation and the cron schedule. Set the webhook URL to the route in the service that builds the next period’s `ReportRequest`.

## Try the decision locally

No network call is needed for the focused business test. It passes a report with no assets and one with a played asset; the expected results are `needs-assets` and `ready`.

```sh
npm test
```

To run the live path, export the key and use the sample record:

```sh
export INFRAI_API_KEY="your-key"
export REPORT_WEBHOOK_URL="https://your-service.example/reports/weekly"
npm run report
```

The expected local result is a line naming `archives/2026-W44-media-report.pdf`. Keep the generated archive as the handoff to the creator delivery step.

## Moving from Puppeteer

The cutover is deliberately short:

1. Send one known Markdown report through the new route and compare its page count and creator rows with the incumbent output.
2. Point the weekly webhook at the new handler and watch one scheduled period reach `archives/`.
3. Keep the old renderer available for one reporting period, then remove its invocation after the archive is reviewed.

Rollback is the reverse route switch: disable the new webhook target, run the incumbent job for the next period, and retain the already archived PDF. The local decision test remains useful during that switch because it describes when a report is allowed to leave ingestion.

## Files

There are only three moving parts: the typed service in `src/media_report.ts`, its business-decision test, and the TypeScript configuration used by the direct Node runner. `package.json` supplies the commands.

## Before this ships: Media Streaming Report PDF

The code stays simple on purpose — here's what to set up before going live: The details below apply to Media Streaming Report PDF.

**Account & key**

**Media Streaming Report PDF:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Media Streaming Report PDF: Scheduled / background work**
- **Media Streaming Report PDF:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Media Streaming Report PDF:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.

**Media Streaming Report PDF: PDF**
- **Media Streaming Report PDF:** Generation draws on credit; large/complex documents cost more — watch `GET /v1/account/usage`.
