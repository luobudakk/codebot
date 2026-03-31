from __future__ import annotations

import json

from app.agents.sse import sse_line


def test_sse_line_format():
    line = sse_line("test", {"a": 1, "中文": "ok"})
    assert line.startswith("event: test")
    assert "data:" in line
    data = line.split("data:", 1)[1].strip().split("\n")[0]
    assert json.loads(data)["中文"] == "ok"
