import os
import json
from datetime import datetime
from typing import Dict, Optional, List
from flask import current_app

class ParaphraseLogger:
    def __init__(self):
        # Create logs directory if it doesn't exist
        self.logs_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
        os.makedirs(self.logs_dir, exist_ok=True)
        self.paraphrase_log_file = os.path.join(self.logs_dir, "paraphrase_logs.jsonl")

    def log_paraphrase(self, request_id: str, original_text: str, paraphrased_text: str) -> None:
        """
        Log a paraphrase entry to the log file.
        
        Args:
            request_id: Unique identifier for the request
            original_text: The original text that was paraphrased
            paraphrased_text: The paraphrased version of the text
        """
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "request_id": request_id,
            "original_text": original_text,
            "paraphrased_text": paraphrased_text
        }
        
        try:
            with open(self.paraphrase_log_file, "a", encoding="utf-8") as f:
                json.dump(log_entry, f, ensure_ascii=False)
                f.write("\n")
            current_app.logger.info(f"[{request_id}] Successfully logged paraphrase result")
        except Exception as e:
            current_app.logger.error(f"[{request_id}] Error logging paraphrase: {str(e)}")

    def get_logs(self, start_time: Optional[datetime] = None, 
                end_time: Optional[datetime] = None, 
                limit: int = 100) -> List[Dict]:
        """
        Retrieve paraphrase logs within the specified time range.
        
        Args:
            start_time: Optional start time filter
            end_time: Optional end time filter
            limit: Maximum number of logs to return (default: 100)
            
        Returns:
            List of log entries matching the criteria
        """
        logs = []
        try:
            with open(self.paraphrase_log_file, "r", encoding="utf-8") as f:
                for line in f:
                    try:
                        entry = json.loads(line)
                        entry_time = datetime.fromisoformat(entry["timestamp"])
                        
                        # Apply time filters if specified
                        if start_time and entry_time < start_time:
                            continue
                        if end_time and entry_time > end_time:
                            continue
                            
                        logs.append(entry)
                        if len(logs) >= limit:
                            break
                    except json.JSONDecodeError:
                        current_app.logger.warning(f"Skipping invalid log entry: {line}")
                        continue
                        
        except FileNotFoundError:
            current_app.logger.warning("No paraphrase logs found")
            return []
        
        return logs

# Create a global instance
paraphrase_logger = ParaphraseLogger()
