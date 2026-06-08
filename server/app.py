from __future__ import annotations

import gc
import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import urlparse

from predictor import DraftPredictor

HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8787"))
MAX_BATCH_CANDIDATES = int(os.environ.get("MAX_BATCH_CANDIDATES", "48"))
ALLOWED_ORIGINS = {
    origin.strip()
    for origin in os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if origin.strip()
}


class PredictDraftHandler(BaseHTTPRequestHandler):
    predictor = DraftPredictor()

    def do_OPTIONS(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API.
        self.send_response(204)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API.
        path = urlparse(self.path).path
        if path == "/":
            self.write_json({"ok": True, "service": "CompCraft ML advisor", "health": "/health", "predict": "/predict-draft"})
            return
        if path == "/health":
            self.write_json({"ok": True, "model": self.predictor.status()})
            return
        self.write_json({"error": "Not found"}, status=404)

    def do_POST(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API.
        path = urlparse(self.path).path
        if path != "/predict-draft":
            self.write_json({"error": "Not found"}, status=404)
            return

        try:
            payload = self.read_json_body()
            if isinstance(payload.get("candidates"), list):
                predictions = [
                    self.predict_candidate(payload, candidate) if index < MAX_BATCH_CANDIDATES else neutral_prediction("Skipped to keep the hosted ML advisor within memory limits")
                    for index, candidate in enumerate(payload["candidates"])
                ]
                gc.collect()
                self.write_json({"predictions": predictions, "model": self.predictor.status()})
            else:
                prediction = self.predictor.predict(payload)
                gc.collect()
                self.write_json(prediction)
        except Exception as error:  # noqa: BLE001 - local dev server should report useful JSON.
            self.write_json({"error": str(error), "model": self.predictor.status()}, status=500)

    def predict_candidate(self, payload: dict, candidate: dict) -> dict:
        try:
            return self.predictor.predict({**payload, "candidate": candidate})
        except Exception as error:  # noqa: BLE001 - keep one bad candidate from failing the whole batch.
            return neutral_prediction(f"Candidate prediction failed: {error}")

    def read_json_body(self) -> dict:
        content_length = int(self.headers.get("Content-Length") or "0")
        raw = self.rfile.read(content_length).decode("utf-8") if content_length else "{}"
        parsed = json.loads(raw or "{}")
        if not isinstance(parsed, dict):
            raise ValueError("Expected a JSON object")
        return parsed

    def write_json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_cors_headers()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_cors_headers(self) -> None:
        origin = self.headers.get("Origin")
        self.send_header("Access-Control-Allow-Origin", origin if origin in ALLOWED_ORIGINS else "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def log_message(self, format: str, *args) -> None:  # noqa: A002 - BaseHTTPRequestHandler API.
        return


def neutral_prediction(reason: str) -> dict:
    return {
        "available": False,
        "neutral": True,
        "score": 50,
        "currentOurWinChance": 0.5,
        "withCandidateOurWinChance": 0.5,
        "winGain": 0,
        "reason": reason,
        "winModel": {"score": 50, "winGain": 0},
        "pickRanker": {"available": False, "score": 50, "probability": 0},
        "enemyIntent": {"available": False, "score": 50, "probability": 0, "denialScore": 50},
        "explanations": [],
    }


def main() -> None:
    model_path = Path("data/ml/models/draft_win_predictor.joblib")
    print(f"CompCraft ML advisor listening on http://{HOST}:{PORT}")
    print(f"Model: {model_path} ({'found' if model_path.exists() else 'missing; neutral responses until exported'})")
    HTTPServer((HOST, PORT), PredictDraftHandler).serve_forever()


if __name__ == "__main__":
    main()
