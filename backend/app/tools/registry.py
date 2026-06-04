"""
Tool registry — config-driven catalog of tools agents/users can run.
Each tool declares: name, description, category, params schema, whether it
requires human approval, and an async executor.
"""
from dataclasses import dataclass, field
from typing import Callable, Awaitable, Any


@dataclass
class ToolDef:
    name: str
    label: str
    description: str
    category: str                      # data | web | automation | dev | util
    params: dict                       # {param: {type, required, description}}
    executor: Callable[[dict], Awaitable[dict]]
    requires_approval: bool = False
    icon: str = "🔧"


_REGISTRY: dict[str, ToolDef] = {}


def register(tool: ToolDef):
    _REGISTRY[tool.name] = tool
    return tool


def get_tool(name: str) -> ToolDef | None:
    return _REGISTRY.get(name)


def all_tools() -> list[ToolDef]:
    return list(_REGISTRY.values())


def tool_catalog() -> list[dict]:
    return [
        {
            "name": t.name, "label": t.label, "description": t.description,
            "category": t.category, "params": t.params,
            "requires_approval": t.requires_approval, "icon": t.icon,
        }
        for t in _REGISTRY.values()
    ]
