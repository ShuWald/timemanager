from fastapi import FastAPI
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

from typing import Optional

class PromptRequest(BaseModel):
    prompt: str
    google_token: Optional[str] = None

@app.post("/api/process")
def process_prompt(request: PromptRequest):
    write_log("INFO", f"Received prompt: {request.prompt}", route="process")
    
    # 1. Fetch user preferences (Mock)
    user_id = "user_123" 
    prefs = firebase.get_user_preferences(user_id)
    
    # 2. Fetch calendar events (Mock)
    date_str = "2026-05-16"
    events = calendar.fetch_events(date_str)
    
    # 3. Pass data to RocketRide pipeline (Mock)
    rocketride_response = rocketride.process_prompt(request.prompt, prefs, events)
    
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

@app.get("/api/hello")
def read_root():
    write_log("INFO", "Hello API was called", route="hello_api")
    return {"message": "Hello from FastAPI!"}
