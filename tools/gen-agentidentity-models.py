#!/usr/bin/env python
"""Generate TypeScript models for huaweicloud-sdk-agentidentity from the Python SDK.

The Python models are machine generated with a very regular shape:

    class Foo:
        sensitive_list = []
        openapi_types = {'a': 'str', 'b': 'list[Bar]'}
        attribute_map = {'a': 'a', 'b': 'b'}
        def __init__(self, a=None, b=None): ...

This script converts them into TypeScript classes with camelCase properties,
`toDict()` (wire/snake_case) and `fromDict()` helpers.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

MODEL_DIR = Path(
    r"C:\Users\Administrator\workspace\agentarts-sdk-python\.venv\Lib\site-packages\huaweicloudsdkagentidentity\v1\model"
)
OUT_DIR = Path(
    r"C:\Users\Administrator\workspace\agentarts-sdk-js\packages\huaweicloud-sdk-agentidentity\src\v1\model"
)

PRIMITIVES = {
    "str": "string",
    "bool": "boolean",
    "int": "number",
    "float": "number",
    "datetime": "string",
    "date": "string",
    "object": "any",
    "byte": "any",
    "file": "any",
}

ENUM_NAME = re.compile(r"^\s{4}([A-Z][A-Z0-9_]*)\s*=\s*\"([^\"]*)\"\s*$", re.M)
# Plain models are declared as `class Foo:`; responses inherit `SdkResponse`.
CLASS_NAME = re.compile(r"^class\s+(\w+)\s*(?:\([^)]*\))?\s*:", re.M)
RESPONSE_BASE = re.compile(r"^class\s+\w+\s*\(\s*SdkResponse\s*\)", re.M)
INIT_SIG = re.compile(r"def __init__\(self(?:,\s*(.*?))?\):")


def parse(text: str) -> dict:
    class_match = CLASS_NAME.search(text)
    if not class_match:
        return {}
    name = class_match.group(1)

    openapi = section(text, "openapi_types")
    attribute_map = section(text, "attribute_map")

    enum_match = ENUM_NAME.findall(text[: text.find("openapi_types")])
    if not openapi and enum_match:
        return {"kind": "enum", "name": name, "values": enum_match}

    init_match = INIT_SIG.search(text)
    params = []
    if init_match and init_match.group(1):
        for part in split_params(init_match.group(1)):
            param = part.split("=")[0].strip()
            if param:
                params.append(param)

    sensitive_match = re.search(r"sensitive_list\s*=\s*\[(.*?)\]", text, re.S)
    sensitive = re.findall(r"['\"](\w+)['\"]", sensitive_match.group(1)) if sensitive_match else []

    fields = []
    for field, ftype in openapi.items():
        fields.append(
            {
                "py_name": field,
                "wire": attribute_map.get(field, field),
                "type": ftype,
                "sensitive": field in sensitive,
            }
        )
    return {
        "kind": "model",
        "name": name,
        "fields": fields,
        "params": params,
        "response": bool(RESPONSE_BASE.search(text)),
    }


def split_params(params: str) -> list[str]:
    depth = 0
    current = ""
    result = []
    for char in params:
        if char in "[({":
            depth += 1
        elif char in "])}":
            depth -= 1
        if char == "," and depth == 0:
            result.append(current)
            current = ""
        else:
            current += char
    if current.strip():
        result.append(current)
    return [item.strip() for item in result]


def section(text: str, name: str) -> dict[str, str]:
    start = text.find(f"{name} = {{")
    if start < 0:
        return {}
    end = text.find("\n    }", start)
    body = text[start:end]
    result = {}
    for field, ftype in re.findall(r"'([^']+)':\s*'([^']*)'", body):
        result[field] = ftype
    return result


def camel(name: str) -> str:
    parts = name.split("_")
    return parts[0] + "".join(part[:1].upper() + part[1:] for part in parts[1:])


def kebab(name: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "-", name).lower()


def type_expression(py_type: str) -> tuple[str, str]:
    """Return (ts type, kind). kind is primitive|model|enum|unknown."""
    py_type = py_type.strip()
    if py_type.startswith("list[") and py_type.endswith("]"):
        inner = py_type[5:-1]
        inner_ts, inner_kind = type_expression(inner)
        return f"{inner_ts}[]", f"list:{inner_kind}"
    if py_type.startswith("dict(") and py_type.endswith(")"):
        inner = py_type[5:-1]
        parts = [part.strip() for part in inner.split(",", 1)]
        value_type = parts[1] if len(parts) > 1 else "object"
        value_ts, value_kind = type_expression(value_type)
        return f"Record<string, {value_ts}>", f"dict:{value_kind}"
    if py_type in PRIMITIVES:
        return PRIMITIVES[py_type], "primitive"
    if py_type in ("str", "object"):
        return "any", "primitive"
    # Model or enum (resolved below by the caller).
    return py_type, "model"


def generate_model(info: dict, model_names: set[str], enum_names: set[str]) -> str:
    name = info["name"]
    imports: dict[str, str] = {}
    field_defs: list[str] = []
    to_dict_lines: list[str] = []
    from_dict_lines: list[str] = []

    for field in info["fields"]:
        ts_type, kind = type_expression(field["type"])
        ts_kind = kind
        base = kind.split(":", 1)[-1] if ":" in kind else kind
        referenced = None
        if base == "model":
            referenced = ts_type if ":" not in kind else None
            if referenced is None:
                referenced = kind.split(":")[-1]
        prop = camel(field["py_name"])
        wire = field["wire"]

        if ts_kind == "model" and ts_type in enum_names:
            ts_type = ts_type
            imports[ts_type] = ts_type
        elif ts_kind == "model" and ts_type in model_names:
            imports[ts_type] = ts_type
        elif ts_kind.startswith("list:model"):
            inner = ts_type[:-2]
            if inner in enum_names or inner in model_names:
                imports[inner] = inner
        elif ts_kind.startswith("dict:model"):
            inner = ts_type.split(", ", 1)[1].rstrip(">")
            if inner in enum_names or inner in model_names:
                imports[inner] = inner

        field_defs.append(f"  {prop}?: {ts_type};")

        if field["sensitive"]:
            to_dict_lines.append(
                f"    if (this.{prop} !== undefined && this.{prop} !== null) result['{wire}'] = '****';"
            )
        else:
            to_dict_lines.append(
                f"    if (this.{prop} !== undefined && this.{prop} !== null) result['{wire}'] = toWire(this.{prop});"
            )

        # fromDict conversion
        target_kind = ts_kind
        if target_kind.startswith("list:model"):
            inner = ts_type[:-2]
            source = f"dict['{wire}']"
            from_dict_lines.append(
                f"      if ({source} !== undefined && {source} !== null) model.{prop} = "
                f"({source} as any[]).map((item) => {inner}.fromDict(item)) as any;"
            )
        elif target_kind == "model" and ts_type in model_names and ts_type not in enum_names:
            source = f"dict['{wire}']"
            from_dict_lines.append(
                f"      if ({source} !== undefined && {source} !== null) model.{prop} = "
                f"{ts_type}.fromDict({source});"
            )
        elif target_kind.startswith("dict:model"):
            source = f"dict['{wire}']"
            inner = ts_type.split(", ", 1)[1].rstrip(">")
            from_dict_lines.append(
                f"      if ({source} !== undefined && {source} !== null) model.{prop} = "
                f"Object.fromEntries(Object.entries({source} as Record<string, any>).map(([k, v]) => [k, {inner}.fromDict(v)])) as any;"
            )
        else:
            from_dict_lines.append(
                f"      if (dict['{wire}'] !== undefined) model.{prop} = dict['{wire}'] as any;"
            )

    import_lines = [
        f"import type {{ {imported} }} from './{kebab(imported)}.js';" if imported in enum_names else None
        for imported in sorted(imports)
    ]
    import_lines = [line for line in import_lines if line]
    value_imports = [
        f"import {{ {imported} }} from './{kebab(imported)}.js';"
        for imported in sorted(imports)
        if imported in model_names and imported not in enum_names
    ]
    enum_imports = [
        f"import {{ {imported} }} from './{kebab(imported)}.js';"
        for imported in sorted(imports)
        if imported in enum_names
    ]

    parts = []
    parts.append("/* eslint-disable */")
    parts.append("// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).")
    if info.get("response"):
        parts.append("import { SdkResponse } from '@huaweicloud/huaweicloud-sdk-core/SdkResponse.js';")
    parts.extend(sorted(set(value_imports)))
    parts.extend(sorted(set(enum_imports)))
    parts.append("import { toWire } from './serialization.js';")
    parts.append("")
    parts.append(f"export class {name} {'extends SdkResponse ' if info.get('response') else ''}{{")
    parts.extend(field_defs if field_defs else [])
    parts.append("")
    parts.append(f"  constructor(init?: Partial<{name}>) {{")
    if info.get("response"):
        parts.append("    super();")
    parts.append("    Object.assign(this, init ?? {});")
    parts.append("  }")
    parts.append("")
    parts.append("  /** Serialize to the wire format used by the Huawei Cloud API. */")
    parts.append("  toDict(): Record<string, any> {")
    parts.append("    const result: Record<string, any> = {};")
    parts.extend(to_dict_lines)
    parts.append("    return result;")
    parts.append("  }")
    parts.append("")
    parts.append(f"  static fromDict(dict?: Record<string, any> | null): {name} {{")
    parts.append(f"    const model = new {name}();")
    parts.append("    if (dict) {")
    parts.extend(from_dict_lines)
    parts.append("    }")
    parts.append("    return model;")
    parts.append("  }")
    parts.append("}")
    parts.append("")
    return "\n".join(parts)


def main() -> int:
    parsed = []
    for path in sorted(MODEL_DIR.glob("*.py")):
        if path.name == "__init__.py":
            continue
        info = parse(path.read_text(encoding="utf-8"))
        if info:
            info["file"] = path.stem
            parsed.append(info)

    model_names = {info["name"] for info in parsed if info["kind"] == "model"}
    enum_names = {info["name"] for info in parsed if info["kind"] == "enum"}

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "serialization.ts").write_text(
        """/* eslint-disable */
// Helper shared by the generated models.

export function toWire(value: any): any {
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => toWire(item));
  }
  if (typeof value === 'object' && typeof value.toDict === 'function') {
    return value.toDict();
  }
  return value;
}
""",
        encoding="utf-8",
    )

    exports = []
    for info in parsed:
        filename = kebab(info["name"]) + ".ts"
        if info["kind"] == "enum":
            body = "\n".join(
                [
                    "/* eslint-disable */",
                    "// Generated from the Huawei Cloud Python SDK (huaweicloudsdkagentidentity v1).",
                    "",
                    f"export enum {info['name']} {{",
                    *[f"  {member} = '{value}'," for member, value in info["values"]],
                    "}",
                    "",
                ]
            )
        else:
            body = generate_model(info, model_names, enum_names)
        (OUT_DIR / filename).write_text(body, encoding="utf-8")
        exports.append(f"export * from './{filename[:-3]}.js';")

    (OUT_DIR / "index.ts").write_text("\n".join(exports) + "\n", encoding="utf-8")
    print(f"generated {len(parsed)} models into {OUT_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
