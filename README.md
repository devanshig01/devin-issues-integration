# GitHub Issues Integration with Devin

A minimal app that orchestrates [Devin](https://devin.ai) sessions to scope and implement GitHub issues. Built with **FastAPI** (backend) and **Typer** (CLI).

## Features

- **List Issues** — Fetch open issues for a configured GitHub repository
- **Scope Session** — Create a Devin session that analyzes an issue and produces an implementation plan + confidence score
- **Implement Session** — Create a Devin session that implements a scoped plan and opens a PR
- **Session Tracking** — All sessions are persisted in SQLite with status, plan, confidence, and PR URL

## Prerequisites

- Python 3.12+
- [Poetry](https://python-poetry.org/docs/#installation)
- A GitHub personal access token
- A Devin API token ([docs](https://docs.devin.ai))

## Setup

1. **Clone and install dependencies:**

   ```bash
   git clone <repo-url>
   cd devin-github-issues-app
   poetry install
   ```

2. **Configure environment variables:**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your values:

   | Variable          | Description                          | Default                          |
   |-------------------|--------------------------------------|----------------------------------|
   | `GITHUB_TOKEN`    | GitHub personal access token         | *(required)*                     |
   | `GITHUB_REPO`     | Target repo in `owner/repo` format   | *(required)*                     |
   | `DEVIN_API_TOKEN` | Devin API token                      | *(required)*                     |
   | `DATABASE_URL`    | SQLite connection string             | `sqlite+aiosqlite:///./app.db`   |
   | `API_HOST`        | FastAPI host                         | `0.0.0.0`                        |
   | `API_PORT`        | FastAPI port                         | `8000`                           |

## Usage

### Start the API server

```bash
poetry run fastapi dev app/main.py
```

The API will be available at `http://localhost:8000`. Interactive docs at `http://localhost:8000/docs`.

### API Endpoints

| Method | Path                          | Description                          |
|--------|-------------------------------|--------------------------------------|
| GET    | `/issues`                     | List issues for the configured repo  |
| GET    | `/sessions`                   | List all stored Devin sessions       |
| GET    | `/sessions/{id}`              | Get a specific session               |
| POST   | `/sessions/scope`             | Create a scope session for an issue  |
| POST   | `/sessions/implement`         | Create an implement session          |
| POST   | `/sessions/{id}/refresh`      | Refresh session status from Devin    |
| GET    | `/healthz`                    | Health check                         |

### CLI Commands

Run commands while the API server is running:

```bash
# List open issues
poetry run devin-issues list-issues

# List issues with a specific state
poetry run devin-issues list-issues --state closed

# Scope an issue (creates a Devin session to analyze and plan)
poetry run devin-issues scope 42

# Check session status and retrieve results
poetry run devin-issues refresh 1

# Implement from a scoped session (creates a Devin session to code + open PR)
poetry run devin-issues implement 1

# List all sessions
poetry run devin-issues sessions
```

## Workflow

1. **List issues** to find one to work on
2. **Scope** the issue — Devin analyzes it and produces a plan with a confidence score
3. **Refresh** the session to retrieve the plan once Devin finishes
4. **Implement** using the scoped plan — Devin writes the code and opens a PR

## Project Structure

```
devin-github-issues-app/
├── app/
│   ├── main.py           # FastAPI application entry point
│   ├── config.py          # Environment-based configuration
│   ├── database.py        # SQLite + SQLAlchemy async setup
│   ├── models.py          # SQLAlchemy ORM models
│   ├── schemas.py         # Pydantic request/response schemas
│   ├── routers/
│   │   ├── issues.py      # /issues endpoints
│   │   └── sessions.py    # /sessions endpoints
│   └── services/
│       ├── github.py      # GitHub API client
│       └── devin.py       # Devin API client
├── cli/
│   └── main.py            # Typer CLI application
├── .env.example           # Environment variable template
├── pyproject.toml         # Project config and dependencies
└── README.md
```
