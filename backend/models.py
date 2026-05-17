from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timedelta

# =====================================================================
# PRODUCTION INTEGRATION TODO (Connected Event Logic & Wrappers)
# =====================================================================
# This module defines the custom logic/wrappers used to "connect" multiple 
# calendar events into a cohesive, plan-able sequence (e.g., a "Laundry" sequence).
#
# Ideal Functionality to Implement:
# 1. Connected Events: Link multiple tasks together (e.g., Start Laundry -> 
#    30 min gap -> Move to Dryer -> 45 min gap -> Fold).
# 2. Custom Attributes: Each event/container needs fields for:
#    - Priority (High, Medium, Low)
#    - Flexibility (Strict vs. flexible start times)
#    - Reminder Lead Time (How long before the event to remind the user)
#    - Spacing/Gaps (Time between connected events)
# 3. Modification Access: The frontend (user) and the AI (via RocketRide/MCP) 
#    must be able to modify these containers (shift times, change priority).
# 4. Calendar Sync: Logic to pull raw events from Calendar API and wrap them 
#    into these containers, or unwrap containers and create distinct Google 
#    Calendar events accordingly.
# =====================================================================

class ConnectedEvent(BaseModel):
    """
    Represents a single sub-event within a larger sequence.
    """
    id: str
    title: str
    start_time: Optional[datetime] = None
    duration_minutes: int
    reminder_lead_minutes: int = Field(default=10, description="How long before to remind")
    # TODO: Add logic to calculate start_time based on previous event's end_time + spacing

class EventContainer(BaseModel):
    """
    A wrapper class that stores multiple 'connected' events.
    Enables users or AI to manipulate the entire block of events at once.
    """
    container_id: str
    sequence_name: str
    priority: str = Field(default="Medium", description="High, Medium, Low")
    is_flexible: bool = Field(default=True, description="Can this block be shifted by the AI?")
    
    events: List[ConnectedEvent] = []
    
    # TODO: Add methods to:
    # - validate_spacing(): Ensure gaps between events are maintained if the block is shifted.
    # - to_calendar_format(): Convert this container into a list of Google Calendar insert requests.
    # - from_calendar_events(): Group raw Google Calendar events back into this container format.

def convert_calendar_to_containers(calendar_events: List[dict]) -> List[EventContainer]:
    """
    Converts raw Google Calendar events into EventContainer objects.
    Currently, this creates a simple EventContainer for each individual calendar event
    as a fallback.
    
    TODO: In the future, rather than generating transient containers on the fly, 
    we should store/load persistent EventContainers in a Firebase database, 
    and associate them with the user's Google Calendar event IDs.
    """
    containers = []
    for event in calendar_events:
        # Extract ID, summary, and times
        event_id = event.get("id", "")
        summary = event.get("summary", "Untitled Event")
        
        # Start and end parsing
        start_data = event.get("start", {})
        start_time_str = start_data.get("dateTime") or start_data.get("date")
        
        end_data = event.get("end", {})
        end_time_str = end_data.get("dateTime") or end_data.get("date")
        
        start_time = None
        duration_minutes = 30  # Default
        
        if start_time_str:
            try:
                # Handle isoformat string parsing, keeping it robust for timezone formats
                t_str = start_time_str.replace('Z', '+00:00')
                start_time = datetime.fromisoformat(t_str)
            except Exception:
                start_time = datetime.now()
                
        if start_time_str and end_time_str:
            try:
                t_start = start_time_str.replace('Z', '+00:00')
                t_end = end_time_str.replace('Z', '+00:00')
                dt_start = datetime.fromisoformat(t_start)
                dt_end = datetime.fromisoformat(t_end)
                duration_minutes = int((dt_end - dt_start).total_seconds() / 60)
            except Exception:
                pass
                
        # Create a ConnectedEvent
        connected_evt = ConnectedEvent(
            id=f"ce_{event_id}",
            title=summary,
            start_time=start_time,
            duration_minutes=duration_minutes
        )
        
        # TODO (Future Feature): Priority and flexibility should be inferred by the AI 
        # or loaded from persistent user rules in Firebase, rather than hardcoded defaults.
        priority = "Medium"
        is_flexible = True
            
        container = EventContainer(
            container_id=f"c_{event_id}",
            sequence_name=f"{summary} Container",
            priority=priority,
            is_flexible=is_flexible,
            events=[connected_evt]
        )
        containers.append(container)
        
    return containers
