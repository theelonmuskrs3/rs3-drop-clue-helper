#!/usr/bin/env python3
"""Lua data sandbox (tools/lua_data_sandbox.py): data converts; capabilities absent; runaway code stops.
Run with /workspace/.venv-lua/bin/python (needs lupa)."""
import json, subprocess, sys, tempfile, os
from pathlib import Path
TOOL = Path(__file__).resolve().parents[1] / 'tools/lua_data_sandbox.py'

def run(src):
    with tempfile.NamedTemporaryFile('w', suffix='.lua', delete=False) as f: f.write(src)
    try: return subprocess.run([sys.executable, str(TOOL), f.name], capture_output=True, text=True, timeout=90)
    finally: os.unlink(f.name)

# plain data module, including the string/table/math helpers data modules use
r = run("local t = {} for i = 1, 3 do t[i] = {name = string.format('P%d', i), xp = math.floor(i * 2.5)} end\n"
        "return {list = t, map = {a = true, b = 'x'}, sparse = {[5] = 1}, n = 0.5}")
assert r.returncode == 0, r.stderr
assert json.loads(r.stdout) == {'list': [{'name': 'P1', 'xp': 2}, {'name': 'P2', 'xp': 5}, {'name': 'P3', 'xp': 7}], 'map': {'a': True, 'b': 'x'}, 'sparse': {'5': 1}, 'n': 0.5}, r.stdout
# deterministic
assert run("return {b = 1, a = {1, 2}}").stdout == run("return {b = 1, a = {1, 2}}").stdout

# no capabilities reachable from the module, including through the string metatable
probe = """local function has(f) local ok, v = pcall(f) return ok and v ~= nil end
return {
  os = has(function() return os end), io = has(function() return io end), require = has(function() return require end),
  package = has(function() return package end), debug = has(function() return debug end), load = has(function() return load end),
  loadstring = has(function() return loadstring end), dofile = has(function() return dofile end), loadfile = has(function() return loadfile end),
  dump = has(function() return string.dump end), sdump = has(function() return ('').dump end),
  meta_dump = has(function() return getmetatable('').__index.dump end), python = has(function() return python end),
  g_os = has(function() return _G.os end), collect = has(function() return collectgarbage end),
}"""
r = run(probe); assert r.returncode == 0, r.stderr
caps = json.loads(r.stdout); assert not any(caps.values()), caps

# runaway code is stopped (instruction budget) and functions are not data
r = run("while true do end"); assert r.returncode != 0 and 'instruction budget exceeded' in r.stderr, r.stderr
r = run("return {f = function() end}"); assert r.returncode != 0 and 'non-data' in r.stderr, r.stderr
# no file creation even if a module got hold of io (RLIMIT_FSIZE=0 in the child; no io in its env either)
r = run("return {x = io and io.open('/tmp/sbt-should-not-exist', 'w') and 1 or 0}"); assert r.returncode == 0 and json.loads(r.stdout) == {'x': 0}
assert not os.path.exists('/tmp/sbt-should-not-exist')
print('PASS lua sandbox: data conversion deterministic; os/io/require/package/debug/load*/dofile/string.dump (incl. via metatable)/python absent; runaway loop stopped; functions rejected')
