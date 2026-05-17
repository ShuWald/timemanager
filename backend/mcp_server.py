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

if __name__ == "__main__":
    # Run using stdio transport (required for local subprocess integration in RocketRide)
    mcp.run(transport="stdio")
