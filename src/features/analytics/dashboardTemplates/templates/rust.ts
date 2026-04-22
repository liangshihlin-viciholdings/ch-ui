// src/features/analytics/dashboardTemplates/templates/rust.ts
import type { DashboardTemplate } from "../types";
import { builderConfig } from "../helpers";

export const rustRuntimeTemplate: DashboardTemplate = {
  id: "rust-runtime",
  name: "Rust Runtime Metrics",
  description: "Tokio runtime, memory allocation, and HTTP metrics for Rust applications",
  tags: ["Rust", "Tokio", "Performance"],
  setupGuide: {
    title: "Setup OpenTelemetry for Rust",
    docsUrl: "https://docs.rs/opentelemetry/latest/opentelemetry/",
    content: `
## 1. Add dependencies to Cargo.toml

\`\`\`toml
[dependencies]
opentelemetry = "0.22"
opentelemetry_sdk = { version = "0.22", features = ["rt-tokio"] }
opentelemetry-otlp = "0.15"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
tracing-opentelemetry = "0.23"
tokio-metrics = "0.3"
\`\`\`

## 2. Initialize OpenTelemetry tracer

\`\`\`rust
use opentelemetry::global;
use opentelemetry_otlp::WithExportConfig;
use opentelemetry_sdk::{runtime, trace as sdktrace, Resource};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

fn init_tracer() -> Result<(), Box<dyn std::error::Error>> {
    let tracer = opentelemetry_otlp::new_pipeline()
        .tracing()
        .with_exporter(
            opentelemetry_otlp::new_exporter()
                .tonic()
                .with_endpoint("http://localhost:4317"),
        )
        .with_trace_config(
            sdktrace::Config::default()
                .with_resource(Resource::new(vec![
                    opentelemetry::KeyValue::new("service.name", "my-rust-app"),
                ])),
        )
        .install_batch(runtime::Tokio)?;

    tracing_subscriber::registry()
        .with(tracing_opentelemetry::layer().with_tracer(tracer))
        .init();
    Ok(())
}
\`\`\`

## 3. Instrument Axum/Actix handlers

Use tower-http middleware for automatic HTTP request tracing:

\`\`\`rust
use tower_http::trace::TraceLayer;

let app = Router::new()
    .route("/", get(handler))
    .layer(TraceLayer::new_for_http());
\`\`\`
`,
  },
  tiles: [
    // Row 0: Metrics
    {
      id: "rust-active-tasks",
      title: "Active Tasks",
      x: 0,
      y: 0,
      w: 3,
      h: 2,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "tokio.runtime.active_tasks" }],
        displayType: "number",
      }),
    },
    {
      id: "rust-memory",
      title: "Memory RSS",
      x: 3,
      y: 0,
      w: 3,
      h: 2,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "process.runtime.rust.memory.rss" }],
        displayType: "number",
      }),
    },
    {
      id: "rust-threads",
      title: "Thread Count",
      x: 6,
      y: 0,
      w: 3,
      h: 2,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "process.threads" }],
        displayType: "number",
      }),
    },
    {
      id: "rust-cpu",
      title: "CPU Utilization",
      x: 9,
      y: 0,
      w: 3,
      h: 2,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "process.cpu.utilization" }],
        displayType: "number",
      }),
    },
    // Row 1: Tokio Runtime Charts
    {
      id: "rust-tasks-chart",
      title: "Active Tasks Over Time",
      x: 0,
      y: 2,
      w: 6,
      h: 5,
      config: builderConfig({
        select: [
          { aggFn: "avg", valueExpression: "tokio.runtime.active_tasks" },
          { aggFn: "avg", valueExpression: "tokio.runtime.blocking_threads" },
        ],
        displayType: "line",
      }),
    },
    {
      id: "rust-poll-chart",
      title: "Task Poll Duration",
      x: 6,
      y: 2,
      w: 6,
      h: 5,
      config: builderConfig({
        select: [
          { aggFn: "p50", valueExpression: "tokio.runtime.task.poll.duration" },
          { aggFn: "p99", valueExpression: "tokio.runtime.task.poll.duration" },
        ],
        displayType: "line",
      }),
    },
    // Row 2: Memory and CPU
    {
      id: "rust-memory-chart",
      title: "Memory Usage",
      x: 0,
      y: 7,
      w: 6,
      h: 5,
      config: builderConfig({
        select: [
          { aggFn: "avg", valueExpression: "process.runtime.rust.memory.rss" },
          { aggFn: "avg", valueExpression: "process.runtime.rust.memory.heap" },
        ],
        displayType: "area",
      }),
    },
    {
      id: "rust-cpu-chart",
      title: "CPU Utilization",
      x: 6,
      y: 7,
      w: 6,
      h: 5,
      config: builderConfig({
        select: [{ aggFn: "avg", valueExpression: "process.cpu.utilization" }],
        displayType: "line",
      }),
    },
    // Row 3: HTTP (if using Axum/Actix with OTel)
    {
      id: "rust-http-latency",
      title: "HTTP Latency Percentiles",
      x: 0,
      y: 12,
      w: 6,
      h: 5,
      config: builderConfig({
        select: [
          { aggFn: "p50", valueExpression: "http.server.duration" },
          { aggFn: "p90", valueExpression: "http.server.duration" },
          { aggFn: "p99", valueExpression: "http.server.duration" },
        ],
        displayType: "line",
      }),
    },
    {
      id: "rust-http-throughput",
      title: "Request Throughput",
      x: 6,
      y: 12,
      w: 6,
      h: 5,
      config: builderConfig({
        select: [{ aggFn: "count", valueExpression: "*" }],
        where: "http.method IS NOT NULL",
        displayType: "line",
      }),
    },
  ],
};
