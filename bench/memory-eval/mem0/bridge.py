"""JSON-lines stdio bridge around open-source mem0 (Memory). Reads the OpenAI key from
%APPDATA%\\desk-board\\openai.key at startup; never prints or stores it.
Requests: {"id","op","args"}; reply: {"id","ok","result"|"error"}.
ops: add{messages,timestamp,metadata} search{query,limit,threshold} all{} delete_text{text} reset{} usage{} close{}
Env: MEM0_DIR (store dir), MEM0_LLM (default gpt-5.6-luna)."""
import os, sys, json, shutil, threading

def _key():
    p = os.path.join(os.environ["APPDATA"], "desk-board", "openai.key")
    with open(p, "r", encoding="utf-8") as f:
        return f.read().strip()

os.environ["OPENAI_API_KEY"] = _key()
real_out = sys.stdout
sys.stdout = sys.stderr  # stray prints from libraries must not corrupt the protocol

USAGE = {"llm_calls": 0, "llm_in": 0, "llm_out": 0, "emb_calls": 0, "emb_in": 0, "by_model": {}}
_lock = threading.Lock()

def _patch():
    from openai.resources.chat.completions import Completions
    from openai.resources.embeddings import Embeddings
    oc, oe = Completions.create, Embeddings.create
    def c(self, *a, **k):
        r = oc(self, *a, **k)
        u = getattr(r, "usage", None)
        with _lock:
            USAGE["llm_calls"] += 1
            if u:
                USAGE["llm_in"] += u.prompt_tokens or 0
                USAGE["llm_out"] += u.completion_tokens or 0
                m = USAGE["by_model"].setdefault(k.get("model", "?"), [0, 0])
                m[0] += u.prompt_tokens or 0
                m[1] += u.completion_tokens or 0
        return r
    def e(self, *a, **k):
        r = oe(self, *a, **k)
        u = getattr(r, "usage", None)
        with _lock:
            USAGE["emb_calls"] += 1
            if u:
                USAGE["emb_in"] += u.prompt_tokens or 0
        return r
    Completions.create, Embeddings.create = c, e
_patch()

from mem0 import Memory
ROOT = os.environ.get("MEM0_DIR") or os.path.join(os.environ.get("TEMP", "."), "mem0eval")
LLM = os.environ.get("MEM0_LLM", "gpt-5.6-luna")
UID = "founder"

def build():
    cfg = {
        "llm": {"provider": "openai", "config": {"model": LLM, "is_reasoning_model": True}},
        "embedder": {"provider": "openai", "config": {"model": "text-embedding-3-small"}},
        "vector_store": {"provider": "qdrant", "config": {"collection_name": "memeval", "path": os.path.join(ROOT, "qdrant"), "embedding_model_dims": 1536, "on_disk": True}},
        "history_db_path": os.path.join(ROOT, "history.db"),
    }
    return Memory.from_config(cfg)

m = None
def fresh():
    global m
    try:
        m.vector_store.client.close()
    except Exception:
        pass
    m = None
    shutil.rmtree(ROOT, ignore_errors=True)
    os.makedirs(ROOT, exist_ok=True)
    m = build()
fresh()

def mem_list():
    r = m.get_all(filters={"user_id": UID}, top_k=2000)
    return r.get("results", r) if isinstance(r, dict) else r

def handle(op, a):
    if op == "add":
        kw = dict(user_id=UID, metadata=a.get("metadata") or {})
        if a.get("timestamp") is not None:
            kw["timestamp"] = a["timestamp"]
        return m.add(a["messages"], **kw)
    if op == "search":
        r = m.search(a["query"], top_k=int(a.get("limit", 8)), filters={"user_id": UID}, threshold=float(a.get("threshold", 0.1)))
        rs = r.get("results", r) if isinstance(r, dict) else r
        return [{"id": x.get("id"), "text": x.get("memory"), "score": x.get("score"), "created_at": x.get("created_at"), "metadata": x.get("metadata")} for x in rs]
    if op == "all":
        return [{"id": x.get("id"), "text": x.get("memory"), "created_at": x.get("created_at"), "metadata": x.get("metadata")} for x in mem_list()]
    if op == "delete_text":
        # Mem0 has no delete-by-content: search for the text, delete memories scoring high or sharing most key tokens.
        needle = a["text"].lower()
        toks = [t for t in needle.replace(",", " ").split() if len(t) > 3]
        hits = handle("search", {"query": a["text"], "limit": 10, "threshold": 0.0})
        gone = []
        for x in hits:
            t = (x["text"] or "").lower()
            if (x["score"] or 0) >= float(a.get("min_score", 0.5)) or (toks and sum(tok in t for tok in toks) >= max(2, len(toks) // 2 + 1)):
                m.delete(x["id"])
                gone.append({"id": x["id"], "text": x["text"]})
        return {"removed": len(gone), "items": gone}
    if op == "reset":
        fresh()
        return True
    if op == "usage":
        return USAGE
    if op == "close":
        return True
    raise ValueError("unknown op " + op)

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    req = json.loads(line)
    try:
        out = {"id": req["id"], "ok": True, "result": handle(req["op"], req.get("args") or {})}
    except Exception as ex:
        out = {"id": req["id"], "ok": False, "error": f"{type(ex).__name__}: {ex}"[:500]}
    real_out.write(json.dumps(out, default=str) + "\n")
    real_out.flush()
    if req["op"] == "close":
        break
