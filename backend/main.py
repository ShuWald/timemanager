import dotenv
import os

# Dynamically resolve and load the centralized .env file in the workspace root
dotenv.load_dotenv(dotenv.find_dotenv())

from typing import Optional
from fastapi import FastAPI, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from logger import write_log

from firebase_client import FirebaseClient
from calendar_client import CalendarClient
from rocketride_client import RocketRideClient

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize singletons/clients
firebase = FirebaseClient()
calendar = CalendarClient()
rocketride = RocketRideClient()

class PromptRequest(BaseModel):
    prompt: str
    google_token: Optional[str] = None

# =====================================================================
# OAUTH TOKEN RESOLVER AND PERSISTENCE ENGINE
# =====================================================================
def get_user_and_google_token(
    authorization: Optional[str] = Header(None),
    x_google_token: Optional[str] = Header(None),
    google_token: Optional[str] = Query(None)
):
    """
    Looks up and resolves the correct user_id and Google OAuth token.
    If X-Google-Token is provided, it is automatically cached in our Mock Firestore DB
    so that on page refresh (when googleToken is temporarily lost), we can still
    safely retrieve it using the persistent user.uid from authorization.
    """
    user_id = "mock_user_id"
    if authorization and authorization.startswith("Bearer "):
        user_id = authorization.split(" ")[1]
        
    from database import db_client
    
    # 1. Identify primary input token (header takes precedence)
    # Ensure we resolve the default Query object to None if called as a regular function
    actual_google_token = google_token if isinstance(google_token, str) else None
    input_token = x_google_token or actual_google_token
    
    if input_token:
        # If the input token is indeed a valid OAuth token, persist it!
        if input_token.startswith("ya29."):
            db_client.save_google_token(user_id, input_token)
            return user_id, input_token
        else:
            # If the frontend sent user.uid in X-Google-Token, look it up by user_id
            db_token = db_client.get_google_token(input_token)
            if db_token:
                return user_id, db_token
            return user_id, input_token

    # 2. Otherwise look it up from database using resolved user_id
    db_token = db_client.get_google_token(user_id)
    if db_token:
        return user_id, db_token
        
    # 3. Last fallback (e.g. if OAuth token has not been generated or it's a completely mock run)
    return user_id, None


@app.post("/api/process")
async def process_prompt(request: PromptRequest):
    write_log("INFO", f"Received prompt: {request.prompt}", route="process")
    
    # 1. Fetch user preferences (Mock)
    user_id = "user_123" 
    prefs = firebase.get_user_preferences(user_id)
    
    # 2. Fetch calendar events with google token lookup fallback
    google_token = request.google_token
    if google_token:
        # If the frontend sent user.uid fallback as the token, resolve it via the database
        if not google_token.startswith("ya29."):
            from database import db_client
            db_token = db_client.get_google_token(google_token)
            if db_token:
                google_token = db_token
                
    date_str = "2026-05-16"
    events = calendar.fetch_events(date_str, google_token=google_token)
    
    # 3. Pass data to RocketRide pipeline (Real Integration)
    rocketride_response = await rocketride.process_prompt(request.prompt, prefs, events)
    
    # 4. Construct final payload
    payload = {
        "status": rocketride_response.get("status"),
        "original_prompt": request.prompt,
        "action": rocketride_response.get("action"),
        "message": rocketride_response.get("message"),
        "details": {
            "user_preferences_used": prefs,
            "calendar_events_considered": len(events)
        }
    }
    
    write_log("INFO", f"Returning payload: {payload}", route="process")
    return payload


@app.get("/api/calendar/events")
def get_calendar_events(
    date: Optional[str] = None,
    authorization: Optional[str] = Header(None),
    x_google_token: Optional[str] = Header(None),
    google_token: Optional[str] = Query(None)
):
    user_id, token = get_user_and_google_token(authorization, x_google_token, google_token)

    if not date:
        import datetime
        date = datetime.date.today().isoformat()

    write_log("INFO", f"Request to get calendar events for date: {date} (User: {user_id})", route="calendar")
    
    try:
        events = calendar.fetch_events(date, google_token=token)
        
        # =====================================================================
        # TODO (Future Feature): Filter/Modify logic
        # =====================================================================
        # Here you can inject logic to filter or modify `events` before sending
        # them to the frontend. E.g., strip out private details or enforce backend rules.
        # =====================================================================
        
        return {
            "status": "success",
            "date": date,
            "events": events
        }
    except Exception as e:
        write_log("ERROR", f"Failed to fetch calendar events: {str(e)}", route="calendar")
        return {
            "status": "error",
            "message": f"Failed to fetch calendar events: {str(e)}",
            "events": []
        }


@app.get("/api/events/containers")
def get_event_containers(
    date: Optional[str] = None,
    authorization: Optional[str] = Header(None),
    x_google_token: Optional[str] = Header(None),
    google_token: Optional[str] = Query(None)
):
    user_id, token = get_user_and_google_token(authorization, x_google_token, google_token)

    if not date:
        import datetime as dt
        date = dt.date.today().isoformat()

    write_log("INFO", f"Request to get event containers for date: {date} (User: {user_id})", route="calendar")
    
    try:
        from database import db_client
        
        # Try fetching persistent EventContainers from Firestore-like database
        containers = db_client.get_event_containers(user_id=user_id)
        
        if not containers:
            write_log("INFO", f"No persistent containers found for {user_id}. Fetching raw calendar and generating transient containers.", route="calendar")
            events = calendar.fetch_events(date, google_token=token)
            
            # Save raw calendar to primitive collection first
            db_client.store_primitive_calendar_events(user_id, events)
            
            from models import convert_calendar_to_containers
            generated_containers = convert_calendar_to_containers(events)
            
            # Persist EventContainers so user edits are saved/scalable
            db_client.store_event_containers(user_id, generated_containers)
            containers = db_client.get_event_containers(user_id=user_id)
            
        return {
            "status": "success",
            "date": date,
            "containers": containers
        }
    except Exception as e:
        write_log("ERROR", f"Failed to fetch event containers: {str(e)}", route="calendar")
        return {
            "status": "error",
            "message": f"Failed to fetch event containers: {str(e)}",
            "containers": []
        }


@app.post("/api/events/revert")
def revert_calendar(
    authorization: Optional[str] = Header(None),
    x_google_token: Optional[str] = Header(None),
    google_token: Optional[str] = Query(None)
):
    user_id, _ = get_user_and_google_token(authorization, x_google_token, google_token)
    write_log("WARNING", f"Revert endpoint triggered for user: {user_id}", route="calendar")
    
    try:
        from database import db_client
        db_client.revert_to_primitive_calendar(user_id)
        return {"status": "success", "message": "Calendar successfully reverted to primitive snapshot."}
    except Exception as e:
        write_log("ERROR", f"Failed to revert calendar: {str(e)}", route="calendar")
        return {"status": "error", "message": f"Reversion failed: {str(e)}"}


# =====================================================================
# EVENT MODIFICATION ENDPOINTS (INTEGRATED WITH DB_CLIENT)
# =====================================================================

@app.put("/api/events/containers/{container_id}")
def update_event_container(
    container_id: str, 
    updates: dict,
    authorization: Optional[str] = Header(None),
    x_google_token: Optional[str] = Header(None)
):
    user_id, _ = get_user_and_google_token(authorization, x_google_token)
    write_log("INFO", f"Updating container {container_id} with {updates} for user {user_id}", route="calendar")
    try:
        from database import db_client
        db_client.update_container_details(user_id, container_id, updates)
        return {"status": "success", "message": f"Container {container_id} updated successfully."}
    except Exception as e:
        write_log("ERROR", f"Failed to update container: {str(e)}", route="calendar")
        return {"status": "error", "message": str(e)}


@app.delete("/api/events/containers/{container_id}")
def delete_event_container(
    container_id: str,
    authorization: Optional[str] = Header(None),
    x_google_token: Optional[str] = Header(None)
):
    user_id, _ = get_user_and_google_token(authorization, x_google_token)
    write_log("INFO", f"Deleting container {container_id} for user {user_id}", route="calendar")
    try:
        from database import db_client
        db_client.delete_container(user_id, container_id)
        return {"status": "success", "message": f"Container {container_id} deleted successfully."}
    except Exception as e:
        write_log("ERROR", f"Failed to delete container: {str(e)}", route="calendar")
        return {"status": "error", "message": str(e)}


@app.post("/api/events/containers/merge")
def merge_event_containers(
    payload: dict,
    authorization: Optional[str] = Header(None),
    x_google_token: Optional[str] = Header(None)
):
    user_id, _ = get_user_and_google_token(authorization, x_google_token)
    container_ids = payload.get("container_ids", [])
    write_log("INFO", f"Merging containers {container_ids} for user {user_id}", route="calendar")
    try:
        from database import db_client
        db_client.merge_containers(user_id, container_ids)
        return {"status": "success", "message": "Containers merged successfully."}
    except Exception as e:
        write_log("ERROR", f"Failed to merge containers: {str(e)}", route="calendar")
        return {"status": "error", "message": str(e)}


@app.put("/api/events/containers/{container_id}/events/{event_id}")
def update_event_in_container(
    container_id: str, 
    event_id: str, 
    updates: dict,
    authorization: Optional[str] = Header(None),
    x_google_token: Optional[str] = Header(None)
):
    user_id, _ = get_user_and_google_token(authorization, x_google_token)
    write_log("INFO", f"Updating event {event_id} in container {container_id} with {updates} for user {user_id}", route="calendar")
    try:
        from database import db_client
        db_client.update_event_in_container(user_id, container_id, event_id, updates)
        return {"status": "success", "message": f"Event {event_id} in container {container_id} updated."}
    except Exception as e:
        write_log("ERROR", f"Failed to update event in container: {str(e)}", route="calendar")
        return {"status": "error", "message": str(e)}


@app.post("/api/events/configurations")
def save_configuration(
    payload: dict,
    authorization: Optional[str] = Header(None),
    x_google_token: Optional[str] = Header(None)
):
    user_id, _ = get_user_and_google_token(authorization, x_google_token)
    name = payload.get("name", "Custom Configuration")
    containers = payload.get("containers", [])
    
    write_log("INFO", f"Saving configuration '{name}' for user {user_id}", route="calendar")
    try:
        from database import db_client
        config_id = db_client.create_sandbox_configuration(user_id, name)
        db_client.store_serialized_containers(user_id, containers, config_id)
        db_client.set_active_configuration(user_id, config_id)
        return {
            "status": "success", 
            "config_id": config_id, 
            "message": f"Configuration '{name}' saved successfully."
        }
    except Exception as e:
        write_log("ERROR", f"Failed to save configuration: {str(e)}", route="calendar")
        return {"status": "error", "message": str(e)}

@app.get("/api/events/configurations")
def get_configurations(
    authorization: Optional[str] = Header(None),
    x_google_token: Optional[str] = Header(None)
):
    user_id, _ = get_user_and_google_token(authorization, x_google_token)
    try:
        from database import db_client
        configs = db_client.get_all_configurations(user_id)
        return {"status": "success", "configurations": configs}
    except Exception as e:
        write_log("ERROR", f"Failed to fetch configurations: {str(e)}", route="calendar")
        return {"status": "error", "message": str(e)}

@app.put("/api/events/configurations/active")
def set_active_configuration(
    payload: dict,
    authorization: Optional[str] = Header(None),
    x_google_token: Optional[str] = Header(None)
):
    user_id, _ = get_user_and_google_token(authorization, x_google_token)
    config_id = payload.get("config_id")
    try:
        from database import db_client
        db_client.set_active_configuration(user_id, config_id)
        return {"status": "success", "message": f"Switched to configuration {config_id}"}
    except Exception as e:
        write_log("ERROR", f"Failed to set active configuration: {str(e)}", route="calendar")
        return {"status": "error", "message": str(e)}

@app.delete("/api/events/configurations/{config_id}")
def delete_configuration(
    config_id: str,
    authorization: Optional[str] = Header(None),
    x_google_token: Optional[str] = Header(None)
):
    user_id, _ = get_user_and_google_token(authorization, x_google_token)
    try:
        from database import db_client
        db_client.delete_configuration(user_id, config_id)
        return {"status": "success", "message": f"Deleted {config_id}"}
    except Exception as e:
        write_log("ERROR", f"Failed to delete config: {str(e)}", route="calendar")
        return {"status": "error", "message": str(e)}

@app.post("/api/events/containers")
def create_event_container(
    payload: dict,
    authorization: Optional[str] = Header(None),
    x_google_token: Optional[str] = Header(None)
):
    user_id, _ = get_user_and_google_token(authorization, x_google_token)
    try:
        from database import db_client
        import uuid
        new_id = f"c_{uuid.uuid4().hex[:8]}"
        new_container = {
            "container_id": new_id,
            "sequence_name": payload.get("sequence_name", "New Thread"),
            "color": payload.get("color", "zinc"),
            "is_custom_named": True,
            "is_flexible": True,
            "priority": "Medium",
            "events": []
        }
        config_id = db_client.get_active_config_id(user_id)
        containers = db_client.get_event_containers(user_id, config_id)
        containers.append(new_container)
        db_client.store_serialized_containers(user_id, containers, config_id)
        return {"status": "success", "container": new_container}
    except Exception as e:
        write_log("ERROR", f"Failed to create event container: {str(e)}", route="calendar")
        return {"status": "error", "message": str(e)}


# =====================================================================
# CALENDAR WRITE-BACK INTEGRATION SYNC
# =====================================================================
@app.post("/api/calendar/sync")
def sync_to_google_calendar(
    authorization: Optional[str] = Header(None),
    x_google_token: Optional[str] = Header(None)
):
    """
    Syncs the active custom configuration from the MockFirestoreDB directly to Google Calendar.
    """
    user_id, google_token = get_user_and_google_token(authorization, x_google_token)
    write_log("INFO", f"Sync to Google Calendar requested for user {user_id}", route="calendar")
    
    try:
        from database import db_client
        containers = db_client.get_event_containers(user_id=user_id)
        
        success_count = 0
        skipped_count = 0
        
        for container in containers:
            for event in container.get("events", []):
                event_id = event.get("id")
                # Skip mock demo events (like 'e1', 'e2', 'e3') or temporary ones
                if not event_id or (event_id.startswith("e") and len(event_id) < 5):
                    skipped_count += 1
                    continue
                    
                title = event.get("title", "(No Title)")
                start_time = event.get("start_time")
                duration = event.get("duration_minutes", event.get("duration", 30))
                reminder_mins = event.get("reminder_mins", 15)
                
                try:
                    calendar.update_event(
                        event_id=event_id,
                        title=title,
                        start_time_iso=start_time,
                        duration_minutes=duration,
                        reminder_mins=reminder_mins,
                        google_token=google_token
                    )
                    success_count += 1
                except Exception as ex:
                    write_log("WARNING", f"Failed to sync event {event_id}: {ex}", route="calendar")
                    
        return {
            "status": "success",
            "message": f"Calendar sync complete. Successfully synchronized {success_count} events to Google Calendar. (Skipped {skipped_count} mock/invalid events)"
        }
    except Exception as e:
        write_log("ERROR", f"Failed to sync calendar: {str(e)}", route="calendar")
        return {"status": "error", "message": f"Sync failed: {str(e)}"}


@app.get("/api/hello")
def read_root():
    write_log("INFO", "Hello API was called", route="hello_api")
    return {"message": "Hello from FastAPI!"}
