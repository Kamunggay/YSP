# Same immutable Node release as the application build.
FROM node:24.22.1-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205
WORKDIR /workspace/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --ignore-scripts
WORKDIR /workspace/contracts/transport
COPY contracts/transport/package.json contracts/transport/package-lock.json ./
RUN npm ci --ignore-scripts
WORKDIR /workspace/frontend
# The npm lock selects Playwright and therefore its Chromium revision.
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
RUN npx --no-install playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/* \
    && chmod -R a+rX /opt/playwright
# Reconciliation fingerprints the verifier and dependency identities as well as
# contract inputs. Copy only these public inputs, not backend source or secrets.
COPY backend/composer.lock /workspace/backend/composer.lock
COPY backend/resources/contracts/session-runtime.json /workspace/backend/resources/contracts/session-runtime.json
COPY scripts/verification.Dockerfile scripts/verification.Dockerfile.dockerignore scripts/verify.ps1 /workspace/scripts/
COPY contracts /workspace/contracts
COPY --chown=node:node frontend /workspace/frontend
# Check the validation consumer against the application's compiler as well as the
# generator-compatible compiler pinned in contracts/transport.
RUN node ../contracts/transport/generate.mjs --fixtures \
    && node node_modules/typescript/bin/tsc -p ../contracts/transport/consumer/tsconfig.json
RUN chown -R node:node /workspace/frontend /workspace/contracts/transport/generated /workspace/contracts/transport/v1 /workspace/contracts/p02-review/v1
USER node
CMD ["npm", "run", "test:browser"]
