BINARY_NAME=avalok
VERSION?=dev
GO=go
GOFLAGS=-ldflags "-X github.com/avalokhq/avalok/internal/cli.Version=$(VERSION)"
NPM=npm

.PHONY: build build-dev build-frontend run test clean deps docker-build docker-up docker-down

build: build-frontend deps
	GOOS=linux GOARCH=amd64 $(GO) build $(GOFLAGS) -o bin/$(BINARY_NAME) ./cmd/avalok

build-dev: build-frontend deps
	$(GO) build $(GOFLAGS) -o bin/$(BINARY_NAME).exe ./cmd/avalok

build-frontend:
	cd web && $(NPM) run build
	rm -rf internal/server/frontend
	mkdir -p internal/server/frontend
	cp -r web/dist/* internal/server/frontend/

run: build-dev
	./bin/$(BINARY_NAME).exe $(ARGS)

test:
	$(GO) test ./... -v

clean:
	rm -rf bin/ internal/server/frontend/ web/dist/

deps:
	$(GO) mod tidy

docker-build:
	docker compose -f deploy/docker-compose.yml build

docker-up:
	docker compose -f deploy/docker-compose.yml up -d

docker-down:
	docker compose -f deploy/docker-compose.yml down
