import os
import datetime
from pathlib import Path

LOGS_DIR = Path(__file__).parent / "logs"
MAIN_LOG_FILE = "main.log"

def write_log(header: str, message: str, main: str = MAIN_LOG_FILE, route: str = None):
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_entry = f"[{timestamp}] [{header}] {message}\n"
    main_log_path = LOGS_DIR / main
    with open(main_log_path, "a", encoding="utf-8") as f:
        f.write(log_entry)
    if route:
        route_log_path = LOGS_DIR / f"{route}.log"
        with open(route_log_path, "a", encoding="utf-8") as f:
            f.write(log_entry)
