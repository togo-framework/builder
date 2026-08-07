.PHONY: build test doctor migrate lint fmt check

build:
	go build ./...

test:
	go test ./internal/...

# The 20 preflight probes. Same code path the setup wizard uses.
doctor:
	go run ./cmd/togo-builder doctor

migrate:
	@test -n "$$DATABASE_URL" || (echo "DATABASE_URL is unset" && exit 1)
	psql -v ON_ERROR_STOP=1 -d "$$DATABASE_URL" -f db/migrations/0001_builder_init.sql

lint:
	go vet ./...

fmt:
	gofmt -l -w .

# What CI runs.
check: fmt lint build test
	@echo "ok"
