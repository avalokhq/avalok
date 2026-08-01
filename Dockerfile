FROM node:22-alpine AS frontend
WORKDIR /build
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM golang:1.26-alpine AS backend
WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend /build/dist/ ./internal/server/frontend/
ARG VERSION=dev
RUN CGO_ENABLED=0 go build -trimpath \
    -ldflags "-s -w -X github.com/avalokhq/avalok/internal/cli.Version=${VERSION}" \
    -o /avalok ./cmd/avalok

FROM alpine:3.22
RUN apk add --no-cache ca-certificates tzdata
COPY --from=backend /avalok /usr/local/bin/avalok
EXPOSE 9090
ENTRYPOINT ["avalok"]
