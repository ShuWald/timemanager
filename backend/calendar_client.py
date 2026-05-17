from logger import write_log

# In the future, initialize googleapiclient here

class CalendarClient:
    def __init__(self):
        write_log("INFO", "Initializing mock CalendarClient", route="calendar")

    def fetch_events(self, date_str: str):
        write_log("MOCK", f"Fetching Calendar events for {date_str}", route="calendar")
        # Mock data return
        return [
            {"id": "evt1", "summary": "Standup", "start": "09:30", "end": "10:00"}
        ]
