#!/usr/bin/env python3
"""Convert a RuneScape Wiki Lua *data* module (pinned, fetched copy) into JSON, in a constrained sandbox.

Usage: lua_data_sandbox.py MODULE.lua > out.json   (run with /workspace/.venv-lua/bin/python; needs lupa)
       lua_data_sandbox.py MODULE.lua --call '["Meat","Fish"]' [--sort COMPARATOR.lua] > out.json
         For data modules that return a function of one argument (e.g. Module:Skill calc/Cooking/data): call it with each
         argument, inside the same sandbox and instruction budget, and return [{arg, items[, order]}]. With --sort, the
         comparator chunk (a pinned copy of the engine's own sort function, e.g. sortTable from Module:Skill calc) runs in the
         same restricted environment and `order` lists the 1-based item indices after Lua 5.1's table.sort, exactly as the
         engine sorts them.

Containment, in layers:
  * The work runs in a child process started under `unshare -rn` (no network namespace) when available,
    with rlimits: 20 s CPU, 1.5 GB address space, no file creation (RLIMIT_FSIZE=0), few open files.
  * Lua 5.1 (lupa.lua51) without Python builtins/eval bridges (register_eval=False, register_builtins=False).
  * The chunk is compiled with loadstring and run under setfenv in a fresh environment that only has
    string (without string.dump), table, math and pure functions (pairs, ipairs, next, type, tostring,
    tonumber, select, error, assert, pcall, unpack, setmetatable, getmetatable, rawget, rawset).
    No os, io, package, require, debug, load*, dofile, collectgarbage, mw. An instruction-count hook aborts runaway code.
  * Only the returned table is serialised (functions are rejected). Python never evaluates Lua output.
"""
import json, os, resource, subprocess, sys

BOOT = r'''
local src, chunkname, budget, calls, sortsrc = ...
local sethook, loadstring, setfenv = debug.sethook, loadstring, setfenv
local function copy(t, skip) local o = {} for k, v in pairs(t) do if not (skip and skip[k]) then o[k] = v end end return o end
local env = {
  string = copy(string, {dump = true}), table = copy(table), math = copy(math),
  pairs = pairs, ipairs = ipairs, next = next, type = type, tostring = tostring, tonumber = tonumber,
  select = select, error = error, assert = assert, pcall = pcall, unpack = unpack,
  setmetatable = setmetatable, getmetatable = getmetatable, rawget = rawget, rawset = rawset,
}
env._G = env
-- strings share one metatable whose __index is the host string table: drop dump there too, so (''):dump is gone as well
string.dump = nil
-- strip the host globals too, so nothing reachable through metatables leaks capabilities
for _, k in ipairs({'os','io','package','require','dofile','loadfile','load','module','collectgarbage','newproxy','gcinfo'}) do _G[k] = nil end
local fn, err = loadstring(src, '=' .. chunkname)
if not fn then error('compile: ' .. tostring(err)) end
setfenv(fn, env)
sethook(function() error('instruction budget exceeded') end, '', budget)
local ok, res = pcall(fn)
if ok and calls ~= nil then
  ok, res = pcall(function()
    if type(res) ~= 'function' then error('--call given but the module did not return a function') end
    local cmp
    if sortsrc ~= nil then
      local cf, cerr = loadstring(sortsrc, '=comparator')
      if not cf then error('comparator compile: ' .. tostring(cerr)) end
      setfenv(cf, env); cmp = cf()
      if type(cmp) ~= 'function' then error('comparator chunk must return a function') end
    end
    local out = {}
    for i = 1, #calls do
      local items = res(calls[i])
      local entry = {arg = calls[i], items = items}
      if cmp and type(items) == 'table' then
        local seq, pos = {}, {}
        for j, v in ipairs(items) do seq[j] = v; pos[v] = j end
        table.sort(seq, cmp)
        local order = {}
        for j, v in ipairs(seq) do order[j] = pos[v] end
        entry.order = order
      end
      out[i] = entry
    end
    return out
  end)
end
sethook()
if not ok then error('run: ' .. tostring(res)) end
return res
'''

def to_py(v, depth=0, seen=None):
    import lupa.lua51 as L
    seen = seen if seen is not None else []
    if depth > 40: raise ValueError('too deep')
    t = L.lua_type(v)
    if t is None:
        if isinstance(v, bool) or v is None or isinstance(v, str): return v
        if isinstance(v, (int, float)):
            if v != v or v in (float('inf'), float('-inf')): return {'__number__': repr(v)}
            return int(v) if float(v).is_integer() else v
        if isinstance(v, bytes): return v.decode('utf-8')
        raise ValueError('unexpected %r' % type(v))
    if t != 'table': raise ValueError('non-data Lua value: ' + t)
    keys = list(v.keys())
    n = len(keys)
    if n and all(isinstance(k, (int, float)) and float(k).is_integer() for k in keys) and sorted(int(k) for k in keys) == list(range(1, n + 1)):
        return [to_py(v[i], depth + 1, seen) for i in range(1, n + 1)]
    out = {}
    for k0 in keys:
        k = k0.decode('utf-8') if isinstance(k0, bytes) else k0
        if not isinstance(k, str):
            if isinstance(k, (int, float)) and float(k).is_integer(): k = str(int(k))   # sparse numeric keys -> strings
            else: raise ValueError('unsupported key %r' % (k,))
        if k in out: raise ValueError('duplicate key after conversion %r' % (k,))
        out[k] = to_py(v[k0], depth + 1, seen)   # look up with the original Lua key
    return out

def child(path, calls=None, sort_path=None):
    resource.setrlimit(resource.RLIMIT_CPU, (20, 20))
    resource.setrlimit(resource.RLIMIT_AS, (1536 << 20, 1536 << 20))
    resource.setrlimit(resource.RLIMIT_FSIZE, (0, 0))
    import lupa.lua51 as L
    src = open(path, encoding='utf-8').read()
    sortsrc = open(sort_path, encoding='utf-8').read() if sort_path else None
    resource.setrlimit(resource.RLIMIT_NOFILE, (16, 16))
    lua = L.LuaRuntime(register_eval=False, register_builtins=False, unpack_returned_tuples=False)
    lcalls = lua.table_from([str(c) for c in calls]) if calls is not None else None
    res = lua.execute(BOOT, src, os.path.basename(path), 200_000_000, lcalls, sortsrc)
    json.dump(to_py(res), sys.stdout, ensure_ascii=False, sort_keys=False)

def parse_opts(argv):
    calls, sort_path, i = None, None, 0
    while i < len(argv):
        if argv[i] == '--call': calls = json.loads(argv[i + 1]); i += 2
        elif argv[i] == '--sort': sort_path = os.path.abspath(argv[i + 1]); i += 2
        else: raise SystemExit('unknown option ' + argv[i])
    if calls is not None and not (isinstance(calls, list) and all(isinstance(c, str) for c in calls)): raise SystemExit('--call takes a JSON list of strings')
    if sort_path and calls is None: raise SystemExit('--sort needs --call')
    return calls, sort_path

if __name__ == '__main__':
    if len(sys.argv) >= 3 and sys.argv[1] == '--child':
        calls, sort_path = parse_opts(sys.argv[3:])
        child(sys.argv[2], calls, sort_path); sys.exit(0)
    path = os.path.abspath(sys.argv[1])
    calls, sort_path = parse_opts(sys.argv[2:])
    extra = (['--call', json.dumps(calls)] if calls is not None else []) + (['--sort', sort_path] if sort_path else [])
    cmd = [sys.executable, os.path.abspath(__file__), '--child', path] + extra
    try: subprocess.run(['unshare', '-rn', 'true'], check=True, capture_output=True); cmd = ['unshare', '-rn'] + cmd
    except Exception: print('warning: unshare unavailable; running without network namespace', file=sys.stderr)
    r = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env={'PATH': '/usr/bin:/bin', 'HOME': '/nonexistent'}, timeout=60)
    if r.returncode: sys.stderr.write(r.stderr.decode()); sys.exit(r.returncode)
    sys.stdout.buffer.write(r.stdout)
