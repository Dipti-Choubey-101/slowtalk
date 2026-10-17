"""SlowTalk: a patient, fully local conversation partner for one friend.
Flask serves the web page. Ollama runs the open-weight model on this laptop.
You only need to edit friend.json, not this file."""
import json
import os
import threading
import webbrowser

import requests
from flask import Flask, Response, jsonify, request, send_from_directory, stream_with_context

BASE = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__)

# Read the friend's settings (name, language, level, model...)
with open(os.path.join(BASE, "friend.json"), encoding="utf-8") as f:
    FRIEND = json.load(f)

OLLAMA = FRIEND.get("ollama_url", "http://localhost:11434")
MODEL = FRIEND.get("model", "gemma3:4b")

LEVELS = {
    "beginner": "Use only very common words, present tense, and sentences under 10 words.",
    "intermediate": "Use everyday vocabulary with simple past and future tenses.",
    "advanced": "Speak naturally, use some idioms, and gently stretch their vocabulary.",
}


def build_prompt():
    """The instructions that turn a general model into THIS friend's tutor."""
    f = FRIEND
    target, native = f["target_language"], f["native_language"]
    return f"""You are a warm, endlessly patient {target} conversation partner for {f['friend_name']}, a {f['level']} learner. Their native language is {native}.
Their goal: {f.get('goal', 'speak with confidence')}. They enjoy: {', '.join(f.get('interests', []))}.

Rules:
- Reply in {target}. {LEVELS.get(f['level'], LEVELS['beginner'])} Keep replies to 1-3 short sentences.
- End with one easy follow-up question, ideally about their interests.
- If their message has a mistake, answer what they meant, then add a final line that starts exactly with "TIP:" showing the corrected phrase with a one-sentence explanation in {native}. Never add a TIP for a correct message. Never shame them.
- If they write in {native} or ask for help (explain, translate, simpler), answer briefly in {native}, then give the {target} phrase to try.
- No markdown, no bullet lists, no emoji."""


@app.get("/")
def home():
    return send_from_directory(os.path.join(BASE, "static"), "index.html")


@app.get("/api/config")
def config():
    return jsonify(
        friend_name=FRIEND["friend_name"],
        target_language=FRIEND["target_language"],
        speech_lang=FRIEND.get("speech_lang", "en-US"),
        model=MODEL,
    )


@app.get("/api/status")
def status():
    """Tells the page if Ollama is running and the model is downloaded."""
    try:
        tags = requests.get(f"{OLLAMA}/api/tags", timeout=3).json()
    except requests.exceptions.RequestException:
        return jsonify(state="offline", message="Ollama isn't running. Open the Ollama app from the Start menu, then reload.")
    names = [m["name"] for m in tags.get("models", [])]
    wanted = MODEL if ":" in MODEL else MODEL + ":latest"
    if wanted not in names:
        return jsonify(state="missing", message=f"Model not downloaded yet. In PowerShell run: ollama pull {MODEL}")
    return jsonify(state="ready")


@app.post("/api/chat")
def chat():
    """Sends the conversation to the local model and streams the answer back."""
    history = request.get_json().get("messages", [])[-20:]  # keep the last 20 turns
    messages = [{"role": "system", "content": build_prompt()}] + history

    def generate():
        try:
            with requests.post(
                f"{OLLAMA}/api/chat",
                json={"model": MODEL, "messages": messages, "stream": True, "options": {"temperature": 0.7}},
                stream=True,
                timeout=300,
            ) as r:
                r.raise_for_status()
                for line in r.iter_lines():
                    if line:
                        piece = json.loads(line).get("message", {}).get("content", "")
                        if piece:
                            yield piece
        except requests.exceptions.RequestException:
            yield "⚠ Can't reach the model. Check that Ollama is running and the model is downloaded."

    return Response(stream_with_context(generate()), mimetype="text/plain; charset=utf-8")


if __name__ == "__main__":
    threading.Timer(1.2, lambda: webbrowser.open("http://localhost:5000")).start()
    app.run(port=5000)
