#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

export MCP_PROJECT_ID="${MCP_PROJECT_ID:-_qs_mcp_architector_api_test}"
PORT="${MCP_HTTP_PORT:-3847}"
BASE="http://127.0.0.1:${PORT}"

call() {
  local name="$1"
  local args="$2"
  local id="$3"
  echo "=== ${name} ===" >&2
  curl -sS -X POST "${BASE}/mcp" \
    -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":${id},\"method\":\"tools/call\",\"params\":{\"name\":\"${name}\",\"arguments\":${args}}}" \
    | node -e "
const chunks=[];process.stdin.on('data',d=>chunks.push(d));process.stdin.on('end',()=>{
  const j=JSON.parse(Buffer.concat(chunks).toString());
  const last=j.lines?.at(-1);
  if(last?.error){console.error('ERROR',JSON.stringify(last.error));process.exit(1)}
  const sc=last?.result?.structuredContent;
  const text=last?.result?.content?.[0]?.text;
  console.log(JSON.stringify(sc??text??last?.result,null,2));
});"
  echo >&2
}

node scripts/mcp-http-bridge.mjs &
BRIDGE_PID=$!
trap 'kill ${BRIDGE_PID} 2>/dev/null || true' EXIT
sleep 0.5

curl -sS "${BASE}/health" | head -c 200
echo -e "\n"

call list-projects '{"query":"architector"}' 10
call get-project-architecture '{}' 11
call list-modules '{}' 12
call set-project-architecture '{"description":"MCP architector test project","replaceModules":true,"modules":[{"name":"index","description":"Main server"},{"name":"storage","description":"Storage layer"}],"dataFlow":{"index":{"dependsOn":["storage"]}}}' 13
call set-project-architecture '{"description":"MCP architector test project","modules":[{"name":"index","description":"Main server updated"},{"name":"storage","description":"Storage layer"}]}' 30
call get-project-architecture '{}' 31
call set-module-details '{"name":"index","description":"MCP server","inputs":"stdio","outputs":"tools","dependencies":["storage"],"files":["src/index.ts"],"facts":[{"kind":"http-endpoint","title":"GET /health","summary":"Bridge health","payload":{"method":"GET","path":"/health"},"refs":{"files":["scripts/mcp-http-bridge.mjs"]}}]}' 14
call set-entries '{"moduleName":"storage","entries":[{"kind":"entity","title":"ProjectArchitecture","summary":"Root architecture file","refs":{"files":["architecture.json"]}}]}' 35
call validate '{}' 36
call validate-architecture '{"checkEntryCoverage":true}' 39
call rebuild-entry-index '{}' 37
call get-slice '{"sliceId":"api","format":"compact","limit":5,"offset":0}' 38
call set-module-data-flow '{"moduleName":"storage","dependsOn":[]}' 32
call rebuild-data-flow '{}' 33
call validate-architecture '{}' 34
call get-module-details '{"moduleName":"index"}' 15
call set-entry '{"kind":"http-endpoint","title":"GET /health","summary":"Bridge health check","payload":{"method":"GET","path":"/health"},"tags":["test"]}' 16
call list-entries '{}' 17
call search-entries '{"query":"health","limit":5}' 18
call list-slices '{}' 19
call get-slice '{"sliceId":"api","format":"compact","limit":10}' 20
call set-slice '{"id":"test-game","title":"Game assets","kinds":["godot-scene"],"tags":["test"]}' 21
call get-slice '{"sliceId":"test-game","format":"compact"}' 22
call set-entry '{"kind":"script","title":"npm build","summary":"Build TypeScript","payload":{"usage":"npm run build","examples":["npm run build"],"parameters":{}},"tags":["script"]}' 23
call get-slice '{"sliceId":"scripts","format":"compact"}' 24

ENTRY_ID=$(call list-entries '{"kind":"http-endpoint"}' 25 | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);const id=j.entries?.[0]?.id; if(id) console.log(id);});")
if [[ -n "${ENTRY_ID:-}" ]]; then
  call get-entry "{\"id\":\"${ENTRY_ID}\"}" 26
  call delete-entry "{\"id\":\"${ENTRY_ID}\"}" 27
fi

call delete-slice '{"sliceId":"test-game"}' 28
call delete-module '{"moduleName":"index"}' 29

echo "All API checks finished."
