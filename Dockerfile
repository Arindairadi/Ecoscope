# Stage 1: build the frontend
FROM node:24-slim AS web
WORKDIR /app
RUN npm install -g pnpm
COPY . .
RUN pnpm install --frozen-lockfile --ignore-scripts
RUN PORT=3000 BASE_PATH=/ pnpm --filter @workspace/earthscope run build

# Stage 2: Python API that also serves the built frontend
FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir uv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev
ENV PATH="/app/.venv/bin:$PATH"
COPY backend ./backend
COPY --from=web /app/artifacts/earthscope/dist/public ./artifacts/earthscope/dist/public
EXPOSE 10000
CMD ["python", "-m", "backend.run"]
