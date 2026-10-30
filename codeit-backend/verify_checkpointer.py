import asyncio
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from typing import TypedDict, Optional

class S(TypedDict, total=False):
    repo: str
    data: str
    question: Optional[str]
    answer: Optional[str]

def fetcher(state: S):
    print("-> Fetcher executed")
    return {"data": "full code context from repo"}

def stuck(state: S):
    print("-> Stuck node executed with data:", state.get("data"))
    return {"answer": f"Guidance for question: {state.get('question')}"}

def router(state: S):
    if state.get("question"):
        return "stuck"
    return "fetcher"

builder = StateGraph(S)
builder.add_node("fetcher", fetcher)
builder.add_node("stuck", stuck)
builder.add_conditional_edges(START, router, {"fetcher": "fetcher", "stuck": "stuck"})
builder.add_edge("fetcher", END)
builder.add_edge("stuck", END)

memory = MemorySaver()
app = builder.compile(checkpointer=memory)

async def test():
    config = {"configurable": {"thread_id": "thread-42"}}
    print("--- STEP 1: Full Pipeline Run ---")
    res1 = await app.ainvoke({"repo": "https://github.com/pallets/flask"}, config=config)
    print("Step 1 output:", res1)

    state = await app.aget_state(config)
    print("Saved Checkpoint values in thread-42:", state.values.keys())

    print("\n--- STEP 2: Stuck Student Follow-Up ---")
    res2 = await app.ainvoke({"question": "Why did os.getenv return None?"}, config=config)
    print("Step 2 output:", res2)

asyncio.run(test())

