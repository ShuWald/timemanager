from logger import write_log
import json

class RocketRideClient:
    def __init__(self, endpoint_url: str = "https://mock.rocketride.api"):
        self.endpoint_url = endpoint_url
        write_log("INFO", f"Initializing mock RocketRideClient with endpoint {self.endpoint_url}", route="rocketride")

    def process_prompt(self, prompt: str, user_prefs: dict, calendar_events: list):
        write_log("MOCK", "Sending payload to RocketRide REST endpoint", route="rocketride")
        
        payload = {
            "prompt": prompt,
            "context": {
                "preferences": user_prefs,
                "events": calendar_events
            }
        }
        write_log("MOCK", f"Payload: {json.dumps(payload)}", route="rocketride")
        
        # Simulate network request to RocketRide
        # import requests
        # response = requests.post(f"{self.endpoint_url}/process", json=payload)
        
        # Mock response
        return {
            "status": "success",
            "action": "schedule_meeting",
            "proposed_time": "14:00",
            "message": f"RocketRide suggested a meeting at 14:00 based on '{prompt}'."
        }
