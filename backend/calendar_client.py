from logger import write_log
import os
import datetime
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

# =====================================================================
# PRODUCTION INTEGRATION TODO (Google Calendar API Connection)
# =====================================================================
# In a production environment, you will integrate with the real Google Calendar
# API using service accounts or OAuth2 credentials (forwarded from the frontend
# client).
#
# Steps to integrate:
# 1. Install dependencies: pip install google-api-python-client google-auth-httplib2 google-auth-oauthlib
# 2. Configure Google Calendar API access on Google Cloud Console and download
#    credentials.json or configure a service account.
# 3. To utilize the frontend forwarded Google OAuth2 token:
#    from google.oauth2.credentials import Credentials
#    from googleapiclient.discovery import build
#    
#    # In fetch_events(), utilize the token provided by PromptRequest:
#    creds = Credentials(token=google_token)
#    service = build('calendar', 'v3', credentials=creds)
# 4. Fetch the events for the given date range:
#    events_result = service.events().list(
#        calendarId='primary',
#        timeMin=start_of_day_utc_iso,
#        timeMax=end_of_day_utc_iso,
#        singleEvents=True,
#        orderBy='startTime'
#    ).execute()
# 5. SYNC WITH EVENTCONTAINER LOGIC:
#    - Map the raw events_result back into our `EventContainer` and `ConnectedEvent` 
#      classes (defined in models.py) so the AI/frontend can modify them.
#    - Provide a method `create_connected_events(container: EventContainer)` that 
#      loops through the container and executes `service.events().insert()` for each, 
#      maintaining the customized spacing and reminder lead times.
# =====================================================================

class CalendarClient:
    def __init__(self):
        write_log("INFO", "Initializing CalendarClient", route="calendar")

    def fetch_events(self, date_str: str, google_token: str = None):
        if not google_token:
            write_log("INFO", f"No google token provided. Returning empty events list for {date_str}", route="calendar")
            return []
            
        try:
            write_log("INFO", f"Fetching REAL Google Calendar events for {date_str}", route="calendar")
            creds = Credentials(token=google_token)
            service = build('calendar', 'v3', credentials=creds)

            try:
                date_parsed = datetime.datetime.strptime(date_str, "%Y-%m-%d")
            except ValueError:
                date_parsed = datetime.datetime.now()

            time_min = datetime.datetime(date_parsed.year, date_parsed.month, date_parsed.day, 0, 0, 0).astimezone().isoformat()
            time_max = datetime.datetime(date_parsed.year, date_parsed.month, date_parsed.day, 23, 59, 59).astimezone().isoformat()

            events_result = service.events().list(
                calendarId='primary',
                timeMin=time_min,
                timeMax=time_max,
                singleEvents=True,
                orderBy='startTime'
            ).execute()

            events = events_result.get('items', [])
            
            # =====================================================================
            # MIDDLEMAN LOGIC PLACEHOLDER
            # =====================================================================
            # USER: You can integrate middleman logic here to modify or filter
            # calendar events based on backend logic before they are displayed.
            # Example: events = custom_filter_logic(events)
            # =====================================================================
            
            return events

        except HttpError as error:
            write_log("ERROR", f"An error occurred fetching events: {error}", route="calendar")
            raise error
        except Exception as e:
            write_log("ERROR", f"Unexpected error: {e}", route="calendar")
            raise e

    def update_event(self, event_id: str, title: str, start_time_iso: str, duration_minutes: int, reminder_mins: int = 15, google_token: str = None):
        if not google_token:
            write_log("MOCK", f"Updating MOCK Calendar event {event_id} -> {title} (starts: {start_time_iso}, duration: {duration_minutes}m, reminder: {reminder_mins}m)", route="calendar")
            return None
            
        try:
            write_log("INFO", f"Updating REAL Google Calendar event {event_id} -> {title}", route="calendar")
            creds = Credentials(token=google_token)
            service = build('calendar', 'v3', credentials=creds)
            
            # Standardize Z to ISO offset
            cleaned_iso = start_time_iso
            if cleaned_iso.endswith("Z"):
                cleaned_iso = cleaned_iso[:-1] + "+00:00"
                
            start_dt = datetime.datetime.fromisoformat(cleaned_iso)
            end_dt = start_dt + datetime.timedelta(minutes=duration_minutes)
            
            event_body = {
                'summary': title,
                'start': {
                    'dateTime': start_dt.isoformat(),
                },
                'end': {
                    'dateTime': end_dt.isoformat(),
                },
                'reminders': {
                    'useDefault': False,
                    'overrides': [
                        {'method': 'popup', 'minutes': reminder_mins}
                    ]
                }
            }
            
            # If it's a locally generated event, it doesn't exist in Google Calendar yet. Insert it.
            if event_id.startswith("e_"):
                write_log("INFO", f"Event {event_id} is a local event. Inserting instead of patching.", route="calendar")
                updated_event = service.events().insert(
                    calendarId='primary',
                    body=event_body
                ).execute()
            else:
                real_event_id = event_id
                if event_id.startswith("ce_"):
                    real_event_id = event_id[3:]
                    
                updated_event = service.events().patch(
                    calendarId='primary',
                    eventId=real_event_id,
                    body=event_body
                ).execute()
            
            write_log("INFO", f"Successfully updated Google Calendar event {event_id}", route="calendar")
            return updated_event
            
        except HttpError as error:
            write_log("ERROR", f"Failed to patch calendar event {event_id}: {error}", route="calendar")
            raise error
        except Exception as e:
            write_log("ERROR", f"Unexpected error patching event {event_id}: {e}", route="calendar")
            raise e
