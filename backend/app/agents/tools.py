from langchain_core.tools import tool
from datetime import datetime
import httpx


@tool
def get_current_datetime() -> str:
    """Get the current date and time."""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


@tool
def calculate(expression: str) -> str:
    """Evaluate a safe mathematical expression. Example: '2 + 2 * 10'"""
    try:
        allowed = set("0123456789+-*/().% ")
        if not all(c in allowed for c in expression):
            return "Error: Invalid characters in expression"
        result = eval(expression, {"__builtins__": {}})
        return str(result)
    except Exception as e:
        return f"Error: {e}"


@tool
def format_code(code: str, language: str = "python") -> str:
    """Format and return a code block with proper markdown formatting."""
    return f"```{language}\n{code}\n```"


@tool
def create_table(headers: list[str], rows: list[list[str]]) -> str:
    """Create a markdown table from headers and rows."""
    header = "| " + " | ".join(headers) + " |"
    separator = "|" + "|".join(["---"] * len(headers)) + "|"
    body = "\n".join("| " + " | ".join(str(c) for c in row) + " |" for row in rows)
    return f"{header}\n{separator}\n{body}"


TOOLS_BY_AGENT = {
    "reception": [get_current_datetime],
    "pm":        [get_current_datetime, create_table, calculate],
    "ba":        [get_current_datetime, create_table],
    "dev":       [get_current_datetime, format_code, calculate],
    "dba":       [get_current_datetime, format_code, create_table],
    "qa":        [get_current_datetime, create_table],
    "rag":       [get_current_datetime],
}
