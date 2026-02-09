import httpx
import typer
from rich.console import Console
from rich.table import Table

cli = typer.Typer(
    name="devin-issues",
    help="CLI for GitHub Issues Integration with Devin",
)
console = Console()

BASE_URL = "http://localhost:8000"


@cli.command("list-issues")
def list_issues(
    state: str = typer.Option("open", help="Issue state: open, closed, all"),
):
    with httpx.Client(timeout=30.0) as client:
        resp = client.get(f"{BASE_URL}/issues", params={"state": state})
        resp.raise_for_status()
        issues = resp.json()

    if not issues:
        console.print("[yellow]No issues found.[/yellow]")
        return

    table = Table(title=f"GitHub Issues ({state})")
    table.add_column("#", style="cyan", justify="right")
    table.add_column("Title", style="white")
    table.add_column("Labels", style="green")
    table.add_column("URL", style="blue")

    for issue in issues:
        labels = ", ".join(issue.get("labels", []))
        table.add_row(
            str(issue["number"]),
            issue["title"],
            labels,
            issue["html_url"],
        )

    console.print(table)


@cli.command("scope")
def scope_issue(
    issue_number: int = typer.Argument(help="GitHub issue number to scope"),
):
    console.print(f"[bold]Creating scope session for issue #{issue_number}...[/bold]")
    with httpx.Client(timeout=120.0) as client:
        resp = client.post(
            f"{BASE_URL}/sessions/scope",
            json={"issue_number": issue_number},
        )
        resp.raise_for_status()
        session = resp.json()

    console.print(f"[green]Scope session created![/green]")
    console.print(f"  Session ID: {session['id']}")
    console.print(f"  Issue: #{session['issue_number']} - {session['issue_title']}")
    console.print(f"  Status: {session['status']}")
    if session.get("devin_session_url"):
        console.print(f"  Devin URL: {session['devin_session_url']}")
    console.print(
        "\n[dim]Use 'refresh <session_id>' to check status and retrieve the plan.[/dim]"
    )


@cli.command("implement")
def implement_issue(
    scope_session_id: int = typer.Argument(
        help="ID of a completed scope session to implement"
    ),
):
    console.print(
        f"[bold]Creating implement session from scope session #{scope_session_id}...[/bold]"
    )
    with httpx.Client(timeout=120.0) as client:
        resp = client.post(
            f"{BASE_URL}/sessions/implement",
            json={"scope_session_id": scope_session_id},
        )
        resp.raise_for_status()
        session = resp.json()

    console.print(f"[green]Implement session created![/green]")
    console.print(f"  Session ID: {session['id']}")
    console.print(f"  Issue: #{session['issue_number']} - {session['issue_title']}")
    console.print(f"  Status: {session['status']}")
    if session.get("devin_session_url"):
        console.print(f"  Devin URL: {session['devin_session_url']}")
    if session.get("pr_url"):
        console.print(f"  PR URL: {session['pr_url']}")


@cli.command("sessions")
def list_sessions():
    with httpx.Client(timeout=30.0) as client:
        resp = client.get(f"{BASE_URL}/sessions")
        resp.raise_for_status()
        sessions = resp.json()

    if not sessions:
        console.print("[yellow]No sessions found.[/yellow]")
        return

    table = Table(title="Devin Sessions")
    table.add_column("ID", style="cyan", justify="right")
    table.add_column("Issue", style="white")
    table.add_column("Type", style="magenta")
    table.add_column("Status", style="green")
    table.add_column("Confidence", style="yellow")
    table.add_column("PR URL", style="blue")

    for s in sessions:
        table.add_row(
            str(s["id"]),
            f"#{s['issue_number']} {s['issue_title']}",
            s["session_type"],
            s["status"],
            s.get("confidence") or "-",
            s.get("pr_url") or "-",
        )

    console.print(table)


@cli.command("refresh")
def refresh_session(
    session_id: int = typer.Argument(help="Session ID to refresh from Devin API"),
):
    console.print(f"[bold]Refreshing session #{session_id}...[/bold]")
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(f"{BASE_URL}/sessions/{session_id}/refresh")
        resp.raise_for_status()
        session = resp.json()

    console.print(f"[green]Session refreshed![/green]")
    console.print(f"  Status: {session['status']}")
    if session.get("plan"):
        console.print(f"\n[bold]Plan:[/bold]\n{session['plan']}")
    if session.get("confidence"):
        console.print(f"\n[bold]Confidence:[/bold] {session['confidence']}")
    if session.get("pr_url"):
        console.print(f"\n[bold]PR URL:[/bold] {session['pr_url']}")


if __name__ == "__main__":
    cli()
