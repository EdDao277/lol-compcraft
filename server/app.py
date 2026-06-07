from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from predictor import DraftPredictor

HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8787"))
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
                predictions = [self.predictor.predict({**payload, "candidate": candidate}) for candidate in payload["candidates"]]
                self.write_json({"predictions": predictions, "model": self.predictor.status()})
            else:
                self.write_json(self.predictor.predict(payload))
        except Exception as error:  # noqa: BLE001 - local dev server should report useful JSON.
            self.write_json({"error": str(error), "model": self.predictor.status()}, status=500)

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


def main() -> None:
    model_path = Path("data/ml/models/draft_win_predictor.joblib")
    print(f"CompCraft ML advisor listening on http://{HOST}:{PORT}")
    print(f"Model: {model_path} ({'found' if model_path.exists() else 'missing; neutral responses until exported'})")
    ThreadingHTTPServer((HOST, PORT), PredictDraftHandler).serve_forever()


if __name__ == "__main__":
    main()
