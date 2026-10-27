FROM docker:28.5.1-cli@sha256:9190b0613792e658a7783cf14b2d5ace5941bb68ede7276922ea36ee457d76ad AS docker-cli
FROM node:24.22.1-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
WORKDIR /workspace/contracts/transport
COPY contracts/transport/package.json contracts/transport/package-lock.json ./
RUN npm ci --ignore-scripts
WORKDIR /workspace
COPY contracts ./contracts
COPY backend/resources/contracts ./backend/resources/contracts
COPY backend/tests ./backend/tests
COPY scripts/run-http-tests.mjs ./scripts/run-http-tests.mjs
CMD ["node", "scripts/run-http-tests.mjs", "backend/tests/session-http.test.mjs"]
