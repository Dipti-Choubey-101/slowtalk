// SlowTalk front-end: draws the chat and streams replies from /api/chat.
const $ = (id) => document.getElementById(id);
const chat = $("chat"), input = $("input"), sendBtn = $("sendBtn");
let cfg = {}, busy = false;
// The conversation is saved in this browser only (localStorage), never on a server.
let history = JSON.parse(localStorage.getItem("slowtalk") || "[]");

// Splits "reply ... TIP: correction" into [reply, correction].
function splitTip(text) {
  const m = text.match(/^([\s\S]*?)\s*TIP:\s*([\s\S]*)$/);
  return m ? [m[1], m[2]] : [text, ""];
}

// Reads a message out loud, a little slower than normal, using Windows' built-in voices.
function speak(text) {
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = cfg.speech_lang;
  u.rate = 0.85;
  speechSynthesis.speak(u);
}

// Adds one message to the screen. Returns set(text) so we can update it while streaming.
function addMessage(role, text) {
  const el = document.createElement("div");
  el.className = "msg " + (role === "user" ? "user" : "tutor");
  const body = document.createElement("p");
  body.className = "text";
  el.appendChild(body);
  let tip = null;
  if (role !== "user") {
    tip = document.createElement("div");
    tip.className = "tip";
    tip.hidden = true;
    const listen = document.createElement("button");
    listen.className = "ghost listen";
    listen.textContent = "Listen";
    listen.onclick = () => speak(body.textContent);
    el.append(tip, listen);
  }
  chat.appendChild(el);
  const set = (t) => {
    if (!tip) {
      body.textContent = t;
    } else {
      const [main, hint] = splitTip(t);
      body.textContent = main;
      tip.textContent = hint;
      tip.hidden = !hint;
    }
    chat.scrollTop = chat.scrollHeight;
  };
  set(text);
  return set;
}

function showEmpty() {
  const d = document.createElement("div");
  d.id = "empty";
  const h = document.createElement("h2");
  h.textContent = `Ready when you are, ${cfg.friend_name}.`;
  const p = document.createElement("p");
  p.textContent = `Say anything in ${cfg.target_language}. Mistakes are the point.`;
  d.append(h, p);
  chat.appendChild(d);
}

// Asks the server if Ollama is running and the model is downloaded.
async function checkStatus() {
  const s = await (await fetch("/api/status")).json();
  $("dot").className = "dot " + (s.state === "ready" ? "ready" : "bad");
  $("notice").style.display = s.message ? "block" : "none";
  $("notice").textContent = s.message || "";
}

async function send(text) {
  text = text.trim();
  if (busy || !text) return;
  busy = true;
  sendBtn.disabled = true;
  $("empty")?.remove();
  history.push({ role: "user", content: text });
  addMessage("user", text);
  const setReply = addMessage("assistant", "");
  let reply = "";
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history }),
    });
    const reader = res.body.getReader(), decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      reply += decoder.decode(value, { stream: true });
      setReply(reply);
    }
  } catch {
    reply = "⚠ Lost the connection. Is the SlowTalk window still open?";
    setReply(reply);
  }
  if (reply.startsWith("⚠")) {
    history.pop();            // failed turn: don't keep it, so retrying is clean
    checkStatus();
  } else {
    history.push({ role: "assistant", content: reply });
    localStorage.setItem("slowtalk", JSON.stringify(history));
  }
  busy = false;
  sendBtn.disabled = false;
  input.focus();
}

// Wire up the buttons and the text box.
$("form").addEventListener("submit", (e) => { e.preventDefault(); const t = input.value; input.value = ""; input.style.height = "auto"; send(t); });
input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("form").requestSubmit(); } });
input.addEventListener("input", () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 140) + "px"; });
document.querySelectorAll(".chip").forEach((b) => (b.onclick = () => send(b.textContent)));
$("new").onclick = () => { history = []; localStorage.removeItem("slowtalk"); chat.innerHTML = ""; showEmpty(); };

(async function init() {
  cfg = await (await fetch("/api/config")).json();
  $("title").textContent = `${cfg.target_language} with ${cfg.friend_name}`;
  $("model").textContent = cfg.model;
  input.placeholder = `Write in ${cfg.target_language}…`;
  checkStatus();
  history.length ? history.forEach((m) => addMessage(m.role, m.content)) : showEmpty();
})();
