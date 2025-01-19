import json
from datetime import datetime
import os

class ParaphraseLogs:
    def __init__(self, log_file="logs/paraphrase_logs.json"):
        self.log_file = log_file
        os.makedirs(os.path.dirname(log_file), exist_ok=True)
        if not os.path.exists(log_file):
            with open(log_file, 'w') as f:
                json.dump([], f)

    def add_log(self, original_text, paraphrased_text):
        try:
            with open(self.log_file, 'r') as f:
                logs = json.load(f)
        except:
            logs = []

        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "original_text": original_text,
            "paraphrased_text": paraphrased_text
        }
        logs.append(log_entry)

        with open(self.log_file, 'w') as f:
            json.dump(logs, f, indent=2)

    def get_logs(self, start_time=None, end_time=None, limit=100):
        with open(self.log_file, 'r') as f:
            logs = json.load(f)

        if start_time:
            start_dt = datetime.fromisoformat(start_time)
            logs = [log for log in logs if datetime.fromisoformat(log["timestamp"]) >= start_dt]

        if end_time:
            end_dt = datetime.fromisoformat(end_time)
            logs = [log for log in logs if datetime.fromisoformat(log["timestamp"]) <= end_dt]

        return logs[-limit:] if limit else logs

paraphrase_logger = ParaphraseLogs()
