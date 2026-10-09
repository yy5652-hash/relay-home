"""Relay Home driven by a Strands agent (the AWS open-source agent framework).

A second host for the same MCP server: where the simulator page stands in for Alexa+, this is a terminal agent
built with the Strands Agents SDK. It loads the same Agent Skill, reaches the household only through /mcp over
Streamable HTTP, and puts every confirmation in front of the person before anything is asked of anyone or bought.

    python relay_agent.py                          talk to Relay (needs a model, see below)
    python relay_agent.py --script                 run the fixed demo conversation and print the transcript
    python relay_agent.py --script --answer no     the same, with the person saying no to every confirmation

Settings (environment): RELAY_URL (default http://127.0.0.1:4317), GEMINI_API_KEY and GEMINI_MODEL for Gemini,
or AWS credentials and STRANDS_MODEL for Amazon Bedrock (Strands' default provider).
"""
import argparse
import asyncio
import json
import os
import sys
import urllib.request
from pathlib import Path

from mcp.types import ElicitResult
from strands import Agent
from strands.tools.mcp import MCPClient

ROOT = Path(__file__).resolve().parents[2]
RELAY_URL = os.environ.get("RELAY_URL", "http://127.0.0.1:4317").rstrip("/")

# Strands negotiates the 2026-07-28 revision with this server and drives its multi-round-trip `input_required`
# results itself: when Relay asks for the person's yes, Strands calls the elicitation callback below and retries the
# tool with the answer. The model never sees the question; it only sees what happened. `confirm_action`, the tool
# for clients that cannot be asked, is kept away from the model so there is no second road to an action.
SKILL = (ROOT / "skills" / "relay-home-evening" / "SKILL.md").read_text().split("---\n", 2)[2].strip()


def session_token() -> str:
    """Each visitor gets a household of their own; the token names it, the same as for any MCP client."""
    request = urllib.request.Request(f"{RELAY_URL}/api/session", data=b"{}", headers={"content-type": "application/json"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)["token"]


def pick_model():
    """Gemini when a key is set; otherwise Strands' default, Amazon Bedrock, with the caller's AWS credentials."""
    if os.environ.get("GEMINI_API_KEY"):
        from strands.models.gemini import GeminiModel
        return GeminiModel(client_args={"api_key": os.environ["GEMINI_API_KEY"]},
                           model_id=os.environ.get("GEMINI_MODEL", "gemini-3.5-flash-lite"), params={"temperature": 0})
    return os.environ.get("STRANDS_MODEL") or None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--script", action="store_true", help="run the fixed demo conversation instead of reading from the terminal")
    parser.add_argument("--answer", choices=["yes", "no"], default="yes", help="with --script: what the person answers to every confirmation")
    args = parser.parse_args()

    token = session_token()

    # Relay's question, put to the person at the terminal. Only "yes" is an acceptance; anything else declines.
    async def ask_person(_context, params) -> ElicitResult:
        if args.script:
            print(f"\n  ? {params.message}\n  > {args.answer}")
            answer = args.answer
        else:
            answer = (await asyncio.to_thread(input, f"\n  ? {params.message}  [yes/no] ")).strip().lower()
        return ElicitResult(action="accept", content={"confirm": True}) if answer in ("y", "yes") else ElicitResult(action="decline")

    relay = MCPClient(url=f"{RELAY_URL}/mcp", headers={"Authorization": f"Bearer {token}"}, elicitation_callback=ask_person,
                      application_name="relay-strands-host", application_version="2.1.0")

    with relay:
        tools = [t for t in relay.list_tools_sync() if t.tool_name != "confirm_action"]
        agent = Agent(model=pick_model(), tools=tools, system_prompt=SKILL, callback_handler=None)
        print(f"Relay Home at {RELAY_URL}/mcp · {len(tools)} tools · Strands agent"
              f" · model {getattr(agent.model, 'config', {}).get('model_id', agent.model.__class__.__name__)}")
        print("The household, the school and the shop are made up. Type what changed; Ctrl-D ends.\n")

        ACTS = {"ask_helper", "place_grocery_order", "cancel_grocery_order", "withdraw_pickup_request", "update_preferences", "record_helper_reply"}

        def turn(text: str) -> None:
            """One exchange, printed as a transcript: what the person said, which tools were called, what the server
            said back for anything that acts (the model's own account may differ; the server's is the fact), the answer."""
            print(f"you:   {text}")
            start = len(agent.messages)
            result = agent(text)
            names, calls = {}, []
            for message in agent.messages[start:]:
                for block in message.get("content", []):
                    if "toolUse" in block:
                        names[block["toolUse"]["toolUseId"]] = block["toolUse"]["name"]
                        calls.append(block["toolUse"]["name"])
                    if "toolResult" in block and names.get(block["toolResult"]["toolUseId"]) in ACTS:
                        said = " ".join(part.get("text", "") for part in block["toolResult"]["content"])
                        print(f"       {names[block['toolResult']['toolUseId']]} → {said[:160]}")
                        data = next((json.loads(part["text"]) for part in block["toolResult"]["content"] if part.get("text", "").startswith("{")), None)
                        if data and data.get("request", {}).get("replyUrl") and data["request"].get("status") == "awaiting reply":
                            print(f"       reply link for {data['request']['name']}: {data['request']['replyUrl']}")
            print(f"       ({', '.join(calls)})")
            print(f"relay: {str(result).strip()}\n")

        if args.script:
            for line in ["School moved Mia's pickup to 5:15 and Alex's train is late. Keep dinner under $8.",
                         "Yes, ask Jo.", "Make the pasta and order what we need.", "What do you remember?"]:
                turn(line)
            return 0
        for line in sys.stdin:
            if line.strip():
                turn(line.strip())
    return 0


if __name__ == "__main__":
    sys.exit(main())
