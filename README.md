# SlowTalk

A patient practice partner for one friend learning a language. It runs an open-weight model
locally through Ollama, so there is no account, no API key, no cost, and no internet needed after setup.
Nothing the friend types ever leaves the laptop.

## Run (Windows)
1. Install [Python 3.11+](https://python.org) (tick **Add python.exe to PATH**).
2. Install [Ollama](https://ollama.com/download), then in PowerShell: `ollama pull gemma3:4b`
3. Edit `friend.json` (name, language, level, interests).
4. Double-click `run.bat`.

## Make it theirs
Everything personal lives in `friend.json`. Change `model` to try any model you have pulled with Ollama.
The tutor's behaviour is the prompt in `build_prompt()` in `app.py`.
