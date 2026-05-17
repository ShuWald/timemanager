import os
import json
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from logger import write_log
from models import EventContainer, ConnectedEvent

# =====================================================================
# FIREBASE ADMIN SDK INITIALIZATION SKELETON
# =====================================================================
# In production, initialize Firestore client here:
# import firebase_admin
# from firebase_admin import credentials, firestore
#
# if not firebase_admin._apps:
#     cred = credentials.Certificate(os.getenv("FIREBASE_SERVICE_ACCOUNT_KEY"))
#     firebase_admin.initialize_app(cred)
# db = firestore.client()
# =====================================================================

class MockFirestoreDB:
    def __init__(self):
        self.filepath = os.path.join(os.path.dirname(os.path.abspath(__file__)), "firestore_db.json")
        self._primitive_events: Dict[str, List[Dict[str, Any]]] = {}
        self._user_configs: Dict[str, Dict[str, Any]] = {}
        self._active_config_id: Dict[str, str] = {}
        self._google_tokens: Dict[str, str] = {}
        self._load_from_disk()
        write_log("INFO", "Initialized MockFirestoreDB with local storage fallback", route="firestore")

    def _load_from_disk(self):
        if os.path.exists(self.filepath):
            try:
                with open(self.filepath, "r") as f:
                    data = json.load(f)
                    self._primitive_events = data.get("primitive_events", {})
                    self._user_configs = data.get("user_configs", {})
                    self._active_config_id = data.get("active_config_id", {})
                    self._google_tokens = data.get("google_tokens", {})
                write_log("INFO", "Successfully loaded database state from disk", route="firestore")
            except Exception as e:
                write_log("ERROR", f"Failed to load database from disk: {e}", route="firestore")

    def _save_to_disk(self):
        def default_serializer(obj):
            if isinstance(obj, (datetime, timedelta)):
                return str(obj)
            raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")

        try:
            with open(self.filepath, "w") as f:
                json.dump({
                    "primitive_events": self._primitive_events,
                    "user_configs": self._user_configs,
                    "active_config_id": self._active_config_id,
                    "google_tokens": self._google_tokens
                }, f, indent=2, default=default_serializer)
            write_log("INFO", "Successfully saved database state to disk", route="firestore")
        except Exception as e:
            write_log("ERROR", f"Failed to save database to disk: {e}", route="firestore")

    # =====================================================================
    # TOKEN RETRIEVAL & RETENTION
    # =====================================================================
    def save_google_token(self, user_id: str, google_token: str):
        if google_token:
            write_log("INFO", f"DB: Saving Google OAuth Token for user {user_id}", route="firestore")
            self._google_tokens[user_id] = google_token
            self._save_to_disk()

    def get_google_token(self, user_id: str) -> Optional[str]:
        token = self._google_tokens.get(user_id)
        if token:
            write_log("INFO", f"DB: Retrieved persisted Google OAuth Token for user {user_id}", route="firestore")
        else:
            write_log("WARNING", f"DB: No Google OAuth Token found for user {user_id}", route="firestore")
        return token

    # =====================================================================
    # 1. PRIMITIVE CALENDAR STORAGE
    # =====================================================================
    
    def store_primitive_calendar_events(self, user_id: str, events: List[Dict[str, Any]]):
        write_log("INFO", f"Storing {len(events)} primitive events for user: {user_id}", route="firestore")
        self._primitive_events[user_id] = events
        self._save_to_disk()

    def get_primitive_calendar_events(self, user_id: str) -> List[Dict[str, Any]]:
        write_log("INFO", f"Fetching primitive events for user: {user_id}", route="firestore")
        return self._primitive_events.get(user_id, [])

    # =====================================================================
    # 2. EVENTCONTAINER & CONFIGURATION MANAGEMENT
    # =====================================================================

    def store_event_containers(self, user_id: str, containers: List[EventContainer], config_id: str = "default"):
        write_log("INFO", f"Storing {len(containers)} event containers in sandbox '{config_id}' for user: {user_id}", route="firestore")
        if user_id not in self._user_configs:
            self._user_configs[user_id] = {}
            
        serialized_containers = []
        for c in containers:
            if isinstance(c, dict):
                serialized_containers.append(c)
            else:
                serialized_containers.append(c.dict())
                
        self._user_configs[user_id][config_id] = {
            "config_id": config_id,
            "name": self._user_configs[user_id].get(config_id, {}).get("name", f"Configuration {config_id}"),
            "containers": serialized_containers,
            "last_updated": datetime.now().isoformat()
        }
        self._save_to_disk()

    def store_serialized_containers(self, user_id: str, serialized_containers: List[Dict[str, Any]], config_id: str = "default"):
        """
        Stores already serialized containers directly (useful for frontend integration).
        """
        write_log("INFO", f"Storing {len(serialized_containers)} serialized containers in sandbox '{config_id}' for user: {user_id}", route="firestore")
        if user_id not in self._user_configs:
            self._user_configs[user_id] = {}
        
        current_name = self._user_configs[user_id].get(config_id, {}).get("name", f"Configuration {config_id}")
        
        self._user_configs[user_id][config_id] = {
            "config_id": config_id,
            "name": current_name,
            "containers": serialized_containers,
            "last_updated": datetime.now().isoformat()
        }
        self._save_to_disk()

    def get_event_containers(self, user_id: str, config_id: Optional[str] = None) -> List[Dict[str, Any]]:
        if not config_id:
            config_id = self.get_active_config_id(user_id)
            
        write_log("INFO", f"Fetching containers for user: {user_id} [Sandbox ID: {config_id}]", route="firestore")
        user_store = self._user_configs.get(user_id, {})
        config = user_store.get(config_id, {})
        return config.get("containers", [])

    def get_all_configurations(self, user_id: str) -> List[Dict[str, Any]]:
        """
        Returns all configuration sandboxes for a user.
        """
        user_store = self._user_configs.get(user_id, {})
        configs = []
        for cid, config in user_store.items():
            configs.append({
                "config_id": cid,
                "name": config.get("name", f"Configuration {cid}"),
                "last_updated": config.get("last_updated")
            })
        return configs

    def delete_configuration(self, user_id: str, config_id: str):
        if user_id in self._user_configs and config_id in self._user_configs[user_id]:
            write_log("INFO", f"Deleting configuration {config_id} for user {user_id}", route="firestore")
            del self._user_configs[user_id][config_id]
            self._save_to_disk()

    def create_sandbox_configuration(self, user_id: str, name: str, source_config_id: str = "default") -> str:
        import uuid
        new_config_id = f"sandbox_{uuid.uuid4().hex[:6]}"
        write_log("INFO", f"Creating calendar sandbox '{name}' ({new_config_id}) for user: {user_id}", route="firestore")
        
        source_containers = self.get_event_containers(user_id, source_config_id)
        
        if user_id not in self._user_configs:
            self._user_configs[user_id] = {}
            
        self._user_configs[user_id][new_config_id] = {
            "config_id": new_config_id,
            "name": name,
            "containers": source_containers,
            "last_updated": datetime.now().isoformat()
        }
        self._save_to_disk()
        return new_config_id

    def set_active_configuration(self, user_id: str, config_id: str):
        write_log("INFO", f"Setting active calendar setup to '{config_id}' for user: {user_id}", route="firestore")
        self._active_config_id[user_id] = config_id
        self._save_to_disk()

    def get_active_config_id(self, user_id: str) -> str:
        return self._active_config_id.get(user_id, "default")

    # =====================================================================
    # 3. SAFETY ROLLBACK / RESTORATION
    # =====================================================================

    def revert_to_primitive_calendar(self, user_id: str):
        write_log("WARNING", f"REVERT TRIGGERED: Restoring calendar to primitive snapshot for user: {user_id}", route="firestore")
        primitive_events = self.get_primitive_calendar_events(user_id)
        from models import convert_calendar_to_containers
        fallback_containers = convert_calendar_to_containers(primitive_events)
        self.store_event_containers(user_id, fallback_containers, "default")
        self.set_active_configuration(user_id, "default")
        write_log("INFO", f"Reversion complete. Calendar restored to primitive structure.", route="firestore")

    # =====================================================================
    # 4. DATABASE MODIFICATION INTERFACES
    # =====================================================================
    
    def update_container_details(self, user_id: str, container_id: str, updates: dict):
        config_id = self.get_active_config_id(user_id)
        containers = self.get_event_containers(user_id, config_id)
        
        write_log("INFO", f"DB: Updating container {container_id} details with {updates}", route="firestore")
        
        for c in containers:
            if c.get("container_id") == container_id:
                if "sequence_name" in updates:
                    c["sequence_name"] = updates["sequence_name"]
                    c["is_custom_named"] = True
                if "color" in updates:
                    c["color"] = updates["color"]
                if "priority" in updates:
                    c["priority"] = updates["priority"]
                if "is_flexible" in updates:
                    c["is_flexible"] = updates["is_flexible"]
                    
        self.store_serialized_containers(user_id, containers, config_id)

    def delete_container(self, user_id: str, container_id: str):
        config_id = self.get_active_config_id(user_id)
        containers = self.get_event_containers(user_id, config_id)
        
        write_log("INFO", f"DB: Deleting container {container_id}", route="firestore")
        
        filtered = [c for c in containers if c.get("container_id") != container_id]
        self.store_serialized_containers(user_id, filtered, config_id)

    def merge_containers(self, user_id: str, container_ids: List[str]):
        if len(container_ids) < 2:
            return
            
        config_id = self.get_active_config_id(user_id)
        containers = self.get_event_containers(user_id, config_id)
        
        write_log("INFO", f"DB: Merging containers {container_ids}", route="firestore")
        
        target_id = container_ids[0]
        source_ids = container_ids[1:]
        
        target_container = None
        events_to_add = []
        
        for c in containers:
            if c.get("container_id") == target_id:
                target_container = c
            elif c.get("container_id") in source_ids:
                events_to_add.extend(c.get("events", []))
                
        if target_container:
            # Consolidate target container events and source container events
            all_events = target_container.get("events", []) + events_to_add
            
            # Helper to parse start time into datetime
            def parse_start_time(e):
                st = e.get("start_time")
                if not st:
                    return datetime.now()
                try:
                    cleaned = st
                    if cleaned.endswith("Z"):
                        cleaned = cleaned[:-1] + "+00:00"
                    return datetime.fromisoformat(cleaned)
                except Exception:
                    return datetime.now()
            
            # Sort events by start time to detect overlaps
            all_events.sort(key=parse_start_time)
            
            # Shifting Resolution Pass: resolve overlapping flexible events
            for i in range(len(all_events) - 1):
                curr_evt = all_events[i]
                next_evt = all_events[i+1]
                
                curr_start = parse_start_time(curr_evt)
                curr_dur = curr_evt.get("duration_minutes", curr_evt.get("duration", 30))
                curr_end = curr_start + timedelta(minutes=curr_dur)
                
                next_start = parse_start_time(next_evt)
                
                if next_start < curr_end:
                    # Conflict found!
                    write_log("INFO", f"DB Merge conflict: '{curr_evt.get('title')}' overlaps with '{next_evt.get('title')}'", route="firestore")
                    
                    is_curr_flexible = curr_evt.get("is_flexible", True)
                    is_next_flexible = next_evt.get("is_flexible", True)
                    
                    if is_next_flexible:
                        # Shift next event forward to start right after current ends
                        new_next_start = curr_end
                        next_evt["start_time"] = new_next_start.isoformat()
                        write_log("INFO", f"DB Merge Resolution: Shifted '{next_evt.get('title')}' forward to {next_evt['start_time']}", route="firestore")
                    elif is_curr_flexible:
                        # Shift current event backward to end right when next starts
                        new_curr_start = next_start - timedelta(minutes=curr_dur)
                        curr_evt["start_time"] = new_curr_start.isoformat()
                        write_log("INFO", f"DB Merge Resolution: Shifted '{curr_evt.get('title')}' backward to {curr_evt['start_time']}", route="firestore")
                    else:
                        # Both are strict. We leave them as overlapping force overlays.
                        write_log("WARNING", f"DB Merge: Both events '{curr_evt.get('title')}' and '{next_evt.get('title')}' are STRICT. Cannot resolve overlap.", route="firestore")
            
            target_container["events"] = all_events
            filtered = [c for c in containers if c.get("container_id") not in source_ids]
            self.store_serialized_containers(user_id, filtered, config_id)

    def update_event_in_container(self, user_id: str, container_id: str, event_id: str, updates: dict):
        config_id = self.get_active_config_id(user_id)
        containers = self.get_event_containers(user_id, config_id)
        
        write_log("INFO", f"DB: Updating event {event_id} in container {container_id} with {updates}", route="firestore")
        
        # Determine precise drag/drop times if snapped hours and minutes are passed from the frontend
        if "new_start_hour" in updates and "new_start_min" in updates:
            hour = updates["new_start_hour"]
            minute = updates["new_start_min"]
            dt = datetime.now()
            updated_dt = datetime(dt.year, dt.month, dt.day, hour, minute)
            updates["start_time"] = updated_dt.isoformat()

        if "new_container_id" in updates:
            new_container_id = updates["new_container_id"]
            moved_event = None
            
            source_container = None
            for c in containers:
                if c.get("container_id") == container_id:
                    source_container = c
                    events = c.get("events", [])
                    for i, e in enumerate(events):
                        if e.get("id") == event_id:
                            moved_event = events.pop(i)
                            break
                    break
                    
            if moved_event:
                # Apply any time modifications passed along with container shift
                if "start_time" in updates:
                    moved_event["start_time"] = updates["start_time"]
                    
                target_container = None
                for c in containers:
                    if c.get("container_id") == new_container_id:
                        target_container = c
                        c.setdefault("events", []).append(moved_event)
                        break
                
                # Auto-delete source container if empty and not custom named
                if source_container and len(source_container.get("events", [])) == 0:
                    if not source_container.get("is_custom_named", False):
                        containers = [c for c in containers if c.get("container_id") != container_id]
            
            self.store_serialized_containers(user_id, containers, config_id)
            return

        for c in containers:
            if c.get("container_id") == container_id:
                for e in c.get("events", []):
                    if e.get("id") == event_id:
                        if "title" in updates:
                            e["title"] = updates["title"]
                        if "duration" in updates:
                            e["duration_minutes"] = updates["duration"]
                        if "is_flexible" in updates:
                            e["is_flexible"] = updates["is_flexible"]
                        if "priority" in updates:
                            e["priority"] = updates["priority"]
                        if "reminder_mins" in updates:
                            e["reminder_mins"] = updates["reminder_mins"]
                        if "start_time" in updates:
                            e["start_time"] = updates["start_time"]
                        break
                break
                
        self.store_serialized_containers(user_id, containers, config_id)

    # =====================================================================
    # 5. LOGIN-TIME SYNCHRONIZATION AND SCHEDULER OPTIMIZATIONS
    # =====================================================================

    async def sync_on_login(self, user_id: str, google_token: str, date_str: str):
        write_log("INFO", f"User logged in: Running login-sync pipeline for {user_id}", route="firestore")
        from calendar_client import CalendarClient
        calendar_client = CalendarClient()
        
        try:
            fresh_events = calendar_client.fetch_events(date_str, google_token=google_token)
            self.store_primitive_calendar_events(user_id, fresh_events)
            existing_containers = self.get_event_containers(user_id)
            
            if not existing_containers:
                from models import convert_calendar_to_containers
                initial_containers = convert_calendar_to_containers(fresh_events)
                self.store_event_containers(user_id, initial_containers, "default")
            else:
                # TODO (Diff Engine Optimization): Match calendar events to active containers by ID
                pass
                
            write_log("INFO", f"Login-sync completed successfully for user {user_id}", route="firestore")
        except Exception as e:
            write_log("ERROR", f"Error during login-sync: {e}", route="firestore")


db_client = MockFirestoreDB()
