from logger import write_log

class FirebaseClient:
    def __init__(self):
        # In the future, initialize firebase_admin app here with API key
        write_log("INFO", "Initializing mock FirebaseClient", route="firebase")

    def get_user_preferences(self, user_id: str):
        write_log("MOCK", f"Fetching preferences for user {user_id} from Firebase", route="firebase")
        # Mock data return
        return {
            "timezone": "America/Los_Angeles",
            "working_hours": {"start": "09:00", "end": "17:00"}
        }
