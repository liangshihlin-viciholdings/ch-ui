# CH-UI OpenTelemetry Collector

Custom OTel Collector for CH-UI. Built via OCB (OpenTelemetry Collector Builder). Ingests telemetry (logs, traces, metrics) from apps via OTLP and writes to ClickHouse.

## Components

**Receivers**: otlp, filelog, hostmetrics, prometheus, nop
**Processors**: batch, memory_limiter, attributes, filter, resource, resourcedetection, transform
**Exporters**: clickhouse, otlphttp, debug
**Extensions**: health_check, pprof

## Build

```bash
# From repo root
docker build -t chui/otel-collector:latest -f otel-collector/Dockerfile otel-collector/
```

## Run Standalone

```bash
docker run --rm \
  -p 4317:4317 -p 4318:4318 -p 13133:13133 \
  -e CLICKHOUSE_ENDPOINT=tcp://clickhouse:9000 \
  -e CLICKHOUSE_DATABASE=default \
  -e CLICKHOUSE_USERNAME=default \
  -e CLICKHOUSE_PASSWORD= \
  chui/otel-collector:latest
```

## Ports

- `4317` — OTLP gRPC
- `4318` — OTLP HTTP
- `13133` — Health check
- `1777` — pprof profiling

## Version Bumps

Update these in lockstep:
- `builder-config.yaml` — all `v<version>` refs
- `Dockerfile` — `OTEL_COLLECTOR_VERSION` ARG default

Current: OTEL_COLLECTOR_VERSION=0.149.0, OTEL_COLLECTOR_CORE_VERSION=1.55.0

## ClickHouse Schema

Tables auto-created by exporter:
- `otel_logs` — timestamp, severity, body, resource attrs, log attrs
- `otel_traces` — trace_id, span_id, parent_span_id, service_name, operation, duration, status
- `otel_metrics` — name, value, timestamp, resource attrs, metric attrs

TTL: 720h (30 days) per `config.yaml`.
