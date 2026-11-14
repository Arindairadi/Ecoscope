"""Smoke-test the actual production Python entry point on a temporary free port."""
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.request
import json

with socket.socket() as listener:
    listener.bind(("127.0.0.1", 0))
    port = listener.getsockname()[1]
env = {**os.environ, "PORT": str(port)}
process = subprocess.Popen([sys.executable, "-m", "backend.run"], env=env,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError("Production entry point exited before health was available.")
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/healthz", timeout=2) as response:
                data = json.load(response)
                assert response.status == 200 and data["service"] == "Ecoscope FastAPI"
                break
        except OSError:
            time.sleep(.2)
    else:
        raise RuntimeError("Production startup did not become healthy within 20 seconds.")
    html = Path("artifacts/earthscope/dist/public/index.html").read_text()
    assert "<title>Ecoscope</title>" in html
    print("PASS production Python entry point, PORT binding and health; built frontend title present.")
finally:
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()
