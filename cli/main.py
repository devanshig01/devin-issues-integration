import httpx
import typer
from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel
from rich.table import Table
from rich.text import Text
from rich.theme import Theme

custom_theme = Theme(
    {
        "header": "bold bright_cyan",
        "success": "bold green",
        "warning": "bold yellow",
        "error": "bold red",
        "info": "dim cyan",
        "label": "bold white",
        "value": "bright_white",
        "muted": "dim white",
        "link": "underline bright_blue",
        "badge.scope": "bold white on dark_orange3",
        "badge.implement": "bold white on blue",
        "status.running": "bold bright_yellow",
        "status.completed": "bold bright_green",
        "status.failed": "bold bright_red",
        "status.creating": "bold bright_cyan",
        "confidence.high": "bold bright_green",
        "confidence.medium": "bold bright_yellow",
        "confidence.low": "bold bright_red",
    }
)

console = Console(theme=custom_theme)

BANNER = r"""[bright_cyan]
     _            _                _
  __| | _____   _(_)_ __          (_)___ ___ _   _  ___  ___
 / _` |/ _ \ \ / / | '_ \  _____ | / __/ __| | | |/ _ \/ __|
| (_| |  __/\ V /| | | | ||_____|| \__ \__ \ |_| |  __/\__ \
 \__,_|\___| \_/ |_|_| |_|       |_|___/___/\__,_|\___||___/
[/bright_cyan]"""

cli = typer.Typer(
    name="devin-issues",
    help="GitHub Issues Integration with Devin AI",
    no_args_is_help=True,
    rich_markup_mode="rich",
)

BASE_URL = "http://localhost:8000"


def _status_style(status: str) -> str:
    mapping = {
        "running": "status.running",
        "completed": "status.completed",
        "failed": "status.failed",
        "creating": "status.creating",
    }
    return mapping.get(status, "value")


def _confidence_style(confidence: "Optional[str]") -> str:
    if not confidence:
        return "muted"
    mapping = {
        "high": "confidence.high",
        "medium": "confidence.medium",
        "low": "confidence.low",
    }
    return mapping.get(confidence.lower(), "value")


def _session_type_badge(session_type: str) -> Text:
    if session_type == "scope":
        return Text(f" SCOPE ", style="badge.scope")
    return Text(f" IMPLEMENT ", style="badge.implement")


def _error_panel(message: str, detail: str = "") -> None:
    body = Text(message, style="error")
    if detail:
        body.append(f"\n{detail}", style="muted")
    console.print(Panel(body, title="Error", border_style="red", padding=(1, 2)))


def _handle_request_error(exc: Exception) -> None:
    if isinstance(exc, httpx.ConnectError):
        _error_panel(
            "Cannot connect to the API server.",
            "Make sure it's running: fastapi dev app/main.py",
        )
    elif isinstance(exc, httpx.HTTPStatusError):
        detail = ""
        try:
            detail = exc.response.json().get("detail", "")
        except Exception:
            pass
        _error_panel(f"API returned {exc.response.status_code}", detail)
    else:
        _error_panel("Unexpected error", str(exc))
    raise typer.Exit(1)


@cli.callback(invoke_without_command=True)
def main(ctx: typer.Context):
    if ctx.invoked_subcommand is None:
        console.print(BANNER)
        console.print(
            Panel(
                "[label]GitHub Issues Integration with Devin AI[/label]\n\n"
                "[muted]Scope issues, generate plans, and auto-implement with Devin.[/muted]\n\n"
                "Run [bright_cyan]devin-issues --help[/bright_cyan] to see available commands.",
                border_style="bright_cyan",
                padding=(1, 3),
            )
        )


@cli.command("list-issues", help="[bright_cyan]List open issues[/bright_cyan] from the configured repo")
def list_issues(
    state: str = typer.Option("open", help="Issue state: open, closed, all"),
):
    console.print()
    with console.status("[info]Fetching issues...[/info]", spinner="dots"):
        try:
            with httpx.Client(timeout=30.0) as client:
                resp = client.get(f"{BASE_URL}/issues", params={"state": state})
                resp.raise_for_status()
                issues = resp.json()
        except Exception as exc:
            _handle_request_error(exc)
            return

    if not issues:
        console.print(
            Panel(
                "[warning]No issues found.[/warning]",
                border_style="yellow",
                padding=(1, 2),
            )
        )
        return

    table = Table(
        title=f"Issues ({state})",
        title_style="header",
        border_style="bright_cyan",
        header_style="bold bright_white",
        row_styles=["", "dim"],
        padding=(0, 1),
        show_lines=False,
    )
    table.add_column("#", style="bold cyan", justify="right", width=6)
    table.add_column("Title", style="bright_white", min_width=30, ratio=3)
    table.add_column("Labels", style="bright_green", ratio=1)
    table.add_column("URL", style="link", ratio=2, no_wrap=True)

    for issue in issues:
        labels = ", ".join(issue.get("labels", [])) or "[muted]-[/muted]"
        table.add_row(
            str(issue["number"]),
            issue["title"],
            labels,
            issue["html_url"],
        )

    console.print(table)
    console.print(
        f"\n  [muted]{len(issues)} issue(s) found. "
        f"Use [bright_cyan]devin-issues scope <number>[/bright_cyan] to scope one.[/muted]\n"
    )


@cli.command("scope", help="[bright_cyan]Create a scope session[/bright_cyan] for an issue")
def scope_issue(
    issue_number: int = typer.Argument(help="GitHub issue number to scope"),
):
    console.print()
    with console.status(
        f"[info]Creating scope session for issue #{issue_number}...[/info]",
        spinner="dots",
    ):
        try:
            with httpx.Client(timeout=120.0) as client:
                resp = client.post(
                    f"{BASE_URL}/sessions/scope",
                    json={"issue_number": issue_number},
                )
                resp.raise_for_status()
                session = resp.json()
        except Exception as exc:
            _handle_request_error(exc)
            return

    content = Text()
    content.append("Session Created\n\n", style="success")
    content.append("ID          ", style="label")
    content.append(f"{session['id']}\n", style="value")
    content.append("Issue       ", style="label")
    content.append(f"#{session['issue_number']} ", style="bold cyan")
    content.append(f"{session['issue_title']}\n", style="value")
    content.append("Status      ", style="label")
    content.append(f"{session['status']}\n", style=_status_style(session["status"]))
    if session.get("devin_session_url"):
        content.append("Devin URL   ", style="label")
        content.append(f"{session['devin_session_url']}\n", style="link")

    console.print(
        Panel(
            content,
            title="Scope Session",
            title_align="left",
            border_style="bright_green",
            padding=(1, 3),
            subtitle="[muted]Use [bright_cyan]devin-issues refresh {0}[/bright_cyan] to check progress[/muted]".format(
                session["id"]
            ),
            subtitle_align="left",
        )
    )
    console.print()


@cli.command("implement", help="[bright_cyan]Create an implement session[/bright_cyan] from a scope")
def implement_issue(
    scope_session_id: int = typer.Argument(
        help="ID of a completed scope session to implement"
    ),
):
    console.print()
    with console.status(
        f"[info]Creating implement session from scope #{scope_session_id}...[/info]",
        spinner="dots",
    ):
        try:
            with httpx.Client(timeout=120.0) as client:
                resp = client.post(
                    f"{BASE_URL}/sessions/implement",
                    json={"scope_session_id": scope_session_id},
                )
                resp.raise_for_status()
                session = resp.json()
        except Exception as exc:
            _handle_request_error(exc)
            return

    content = Text()
    content.append("Session Created\n\n", style="success")
    content.append("ID          ", style="label")
    content.append(f"{session['id']}\n", style="value")
    content.append("Issue       ", style="label")
    content.append(f"#{session['issue_number']} ", style="bold cyan")
    content.append(f"{session['issue_title']}\n", style="value")
    content.append("Status      ", style="label")
    content.append(f"{session['status']}\n", style=_status_style(session["status"]))
    if session.get("devin_session_url"):
        content.append("Devin URL   ", style="label")
        content.append(f"{session['devin_session_url']}\n", style="link")
    if session.get("pr_url"):
        content.append("PR URL      ", style="label")
        content.append(f"{session['pr_url']}\n", style="link")

    console.print(
        Panel(
            content,
            title="Implement Session",
            title_align="left",
            border_style="blue",
            padding=(1, 3),
            subtitle="[muted]Devin is working on the implementation...[/muted]",
            subtitle_align="left",
        )
    )
    console.print()


@cli.command("sessions", help="[bright_cyan]List all stored sessions[/bright_cyan]")
def list_sessions():
    console.print()
    with console.status("[info]Fetching sessions...[/info]", spinner="dots"):
        try:
            with httpx.Client(timeout=30.0) as client:
                resp = client.get(f"{BASE_URL}/sessions")
                resp.raise_for_status()
                sessions = resp.json()
        except Exception as exc:
            _handle_request_error(exc)
            return

    if not sessions:
        console.print(
            Panel(
                "[muted]No sessions yet. Use [bright_cyan]devin-issues scope <issue>[/bright_cyan] to create one.[/muted]",
                border_style="bright_cyan",
                padding=(1, 2),
            )
        )
        return

    table = Table(
        title="Devin Sessions",
        title_style="header",
        border_style="bright_cyan",
        header_style="bold bright_white",
        row_styles=["", "dim"],
        padding=(0, 1),
        show_lines=True,
    )
    table.add_column("ID", style="bold cyan", justify="right", width=5)
    table.add_column("Issue", style="bright_white", min_width=20, ratio=2)
    table.add_column("Type", justify="center", width=14)
    table.add_column("Status", width=12)
    table.add_column("Confidence", justify="center", width=12)
    table.add_column("PR", style="link", ratio=1)

    for s in sessions:
        type_badge = _session_type_badge(s["session_type"])
        status_text = Text(s["status"], style=_status_style(s["status"]))
        conf = s.get("confidence") or "-"
        conf_text = Text(conf, style=_confidence_style(s.get("confidence")))
        pr = s.get("pr_url") or Text("-", style="muted")

        table.add_row(
            str(s["id"]),
            f"#{s['issue_number']} {s['issue_title']}",
            type_badge,
            status_text,
            conf_text,
            pr,
        )

    console.print(table)
    console.print(
        f"\n  [muted]{len(sessions)} session(s). "
        f"Use [bright_cyan]devin-issues refresh <id>[/bright_cyan] to update status.[/muted]\n"
    )


@cli.command("refresh", help="[bright_cyan]Refresh session[/bright_cyan] status from Devin")
def refresh_session(
    session_id: int = typer.Argument(help="Session ID to refresh from Devin API"),
):
    console.print()
    with console.status(
        f"[info]Refreshing session #{session_id}...[/info]", spinner="dots"
    ):
        try:
            with httpx.Client(timeout=30.0) as client:
                resp = client.post(f"{BASE_URL}/sessions/{session_id}/refresh")
                resp.raise_for_status()
                session = resp.json()
        except Exception as exc:
            _handle_request_error(exc)
            return

    content = Text()
    content.append("Session Refreshed\n\n", style="success")
    content.append("ID          ", style="label")
    content.append(f"{session['id']}\n", style="value")
    content.append("Status      ", style="label")
    content.append(
        f"{session['status']}\n", style=_status_style(session["status"])
    )

    if session.get("confidence"):
        content.append("Confidence  ", style="label")
        content.append(
            f"{session['confidence']}\n",
            style=_confidence_style(session.get("confidence")),
        )

    if session.get("pr_url"):
        content.append("PR URL      ", style="label")
        content.append(f"{session['pr_url']}\n", style="link")

    console.print(
        Panel(
            content,
            title=f"Session #{session_id}",
            title_align="left",
            border_style="bright_green",
            padding=(1, 3),
        )
    )

    if session.get("plan"):
        console.print(
            Panel(
                Markdown(session["plan"]),
                title="Implementation Plan",
                title_align="left",
                border_style="bright_cyan",
                padding=(1, 3),
            )
        )

    console.print()


if __name__ == "__main__":
    cli()
