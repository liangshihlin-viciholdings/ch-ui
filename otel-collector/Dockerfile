## Build ######################################################################
ARG OTEL_COLLECTOR_VERSION=0.149.0

FROM otel/opentelemetry-collector-builder:${OTEL_COLLECTOR_VERSION} AS ocb-bin
FROM golang:1.26-alpine AS builder

COPY --from=ocb-bin /usr/local/bin/ocb /usr/local/bin/ocb
WORKDIR /build
COPY builder-config.yaml .

RUN --mount=type=cache,target=/go/pkg/mod,id=ocb-gomod \
    --mount=type=cache,target=/root/.cache/go-build,id=ocb-gobuild \
    CGO_ENABLED=0 ocb --config=builder-config.yaml

## Runtime ####################################################################
FROM alpine:3.23 AS runtime

ARG USER_UID=10001
ARG USER_GID=10001

RUN apk add --no-cache ca-certificates wget && \
    addgroup -S -g ${USER_GID} otel && \
    adduser -S -u ${USER_UID} -G otel otel && \
    install -d -m 0755 -o ${USER_UID} -g ${USER_GID} /etc/otelcol

COPY --from=builder --chmod=755 /build/output/otelcol-chui /otelcol-chui
COPY --chown=${USER_UID}:${USER_GID} config.yaml /etc/otelcol/config.yaml

USER ${USER_UID}:${USER_GID}

EXPOSE 4317 4318 13133

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -q --spider http://localhost:13133/ || exit 1

ENTRYPOINT ["/otelcol-chui"]
CMD ["--config=/etc/otelcol/config.yaml"]

LABEL org.opencontainers.image.title="CH-UI OTel Collector" \
      org.opencontainers.image.description="Custom OTel collector for CH-UI with ClickHouse exporter" \
      org.opencontainers.image.licenses="Apache-2.0"
