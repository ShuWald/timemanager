import sys
import os

# Ensure the backend directory is in the Python path for imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from mcp.server.fastmcp import FastMCP
from logger import write_log

# Initialize the MCP server
mcp = FastMCP("OptiTime MCP Server")

@mcp.tool()
def trigger_test_backend() -> str:
    """Triggers the test backend function and writes a log entry."""
    print("Test backend function called via MCP stdio transport", file=sys.stderr)
    
    # Write a log entry to main.log and also to a dedicated mcp_trigger.log
    write_log(
        header="INFO", 
        message="Test backend function triggered via MCP successfully!", 
        route="mcp_trigger"
    )
    
    return "Test backend function triggered! Check backend/logs/main.log and backend/logs/mcp_trigger.log for the logged entry."

@mcp.tool()
def pipeline_log(level: str, message: str) -> str:
    """
    Allows the Gemini Agent to write intermediate thought processes and execution 
    steps directly to the backend logging system.
    """
    print(f"Pipeline Log [{level}]: {message}", file=sys.stderr)
    write_log(
        header=level.upper() if level else "INFO",
        message=f"[AGENT TRACE] {message}",
        route="rocketride_pipeline"
    )
    return "Log entry successfully recorded."

@mcp.tool()
def get_active_calendar_configuration(user_id: str = "mock_user_id") -> str:
    """
    Fetches the active EventContainers configuration for the user.
    The AI should use this tool to inspect the user's current board layout (threads, colors, flexibility, events)
    before making any scheduling modifications.
    """
    print("MCP Tool: get_active_calendar_configuration called", file=sys.stderr)
    write_log("INFO", f"[MCP TOOL] get_active_calendar_configuration called for user: {user_id}", route="mcp_tools")
    
    # =====================================================================
    # TODO (Production Database Connection):
    # 1. Import db_client: `from database import db_client`
    # 2. Get the active config ID: `active_config = db_client.get_active_config_id(user_id)`
    # 3. Retrieve containers: `containers = db_client.get_event_containers(user_id, active_config)`
    # 4. Serialize the containers list to JSON and return it so the Gemini model
    #    understands the exact start times, custom names, and priorities of the user's day.
    # =====================================================================
    
    mock_description = (
        "ACTIVE CONFIGURATION (MOCK FETCH):\n"
        "- Active Sandbox ID: 'default'\n"
        "- Containers count: 3\n"
        "  1. [Thread: Work Tasks, Color: blue, Flexible: False]\n"
        "     - Event: 'Daily Sync' (9:00 AM - 9:30 AM) - strict\n"
        "  2. [Thread: Household Chores, Color: purple, Flexible: True]\n"
        "     - Event: 'Laundry Cycle 1' (10:00 AM - 10:45 AM) - flexible\n"
        "  3. [Thread: Personal/Fitness, Color: green, Flexible: True]\n"
        "     - Event: 'Gym Run' (12:00 PM - 1:00 PM) - flexible\n"
    )
    return mock_description

@mcp.tool()
def optimize_flexible_events(user_id: str, prompt: str) -> str:
    """
    Optimizes the active timeline by shifting flexible events and inserting new ones.
    The AI will trigger this tool when asked to resolve conflicts or fit new tasks into the day.
    """
    print(f"MCP Tool: optimize_flexible_events called with prompt: {prompt}", file=sys.stderr)
    write_log("INFO", f"[MCP TOOL] optimize_flexible_events called for user {user_id} with prompt: {prompt}", route="mcp_tools")
    
    # =====================================================================
    # TODO (Production Scheduling & Shifting Engine):
    # 1. Fetch active containers from `db_client.get_event_containers(...)`.
    # 2. Apply scheduling shifting rules (e.g. shift flexible Laundry/Gym slots forward 
    #    or backward to resolve overlaps, while keeping strict Work Sync locked).
    # 3. Save the modified containers back to active config:
    #    `db_client.store_serialized_containers(user_id, modified_containers, config_id)`
    # 4. Automatically trigger real-time UI updates on the frontend (Gantt board will reload).
    # 5. Propagate changes back to Google Calendar:
    #    For each shifted event, call `calendar_client.update_event(...)` to keep Google fully synced!
    # =====================================================================
    
    mock_response = (
        f"SIMULATED TIMELINE OPTIMIZATION SUCCESSFUL!\n"
        f"Prompt Action: '{prompt}'\n"
        f"Modifications Made in Current Configuration:\n"
        f"- Created new event 'Laundry Cycle 2' in 'Household Chores' thread.\n"
        f"- Shifted flexible 'Gym Run' from 12:00 PM to 1:30 PM to preserve a 30-minute spacing/gap after chores.\n"
        f"- Auto-saved new schedule back to database sandbox 'default'.\n"
        f"- Triggered background Google Calendar update for affected event IDs."
    )
    return mock_response

if __name__ == "__main__":
    # Run using stdio transport (required for local subprocess integration in RocketRide)
    mcp.run(transport="stdio")
