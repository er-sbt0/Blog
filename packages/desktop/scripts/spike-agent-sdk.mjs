#!/usr/bin/env node
/**
 * docs/plans/agent-block.md §5 phase 0, the half that needs no window: the
 * Agent SDK loads, authenticates, and calls an in-process tool.
 *
 *   node packages/desktop/scripts/spike-agent-sdk.mjs
 *   ELECTRON_RUN_AS_NODE=1 packages/desktop/node_modules/.bin/electron \
 *     packages/desktop/scripts/spike-agent-sdk.mjs
 *
 * The second spelling is the one that matters: it is Electron's own Node, the
 * runtime `agent.js` runs in. Prints the auth source and the tool's arguments,
 * never the model's prose. Costs one short turn on whatever login `claude` has.
 */
import os from "node:os";
import { createAgentSession } from "../src/agent.js";

const ms = (t) => `${(performance.now() - t).toFixed(0)} ms`;
const started = performance.now();
let called = null;

let finished;
const done = new Promise((resolve) => {
  finished = resolve;
});

const session = createAgentSession({
  cwd: os.tmpdir(),
  executeTool: async (name, input) => {
    called = { name, input };
    return { ok: true, text: "stateHash: h_spike\n\nb1         paragraph       Hello." };
  },
  onEvent: (event) => {
    if (event.type === "init") {
      console.log(
        `init: claude ${event.claudeCodeVersion}, model ${event.model}, ` +
          `apiKeySource=${event.apiKeySource}, tools=${event.tools.join(",")} — ${ms(started)}`,
      );
    } else if (event.type === "result") {
      console.log(`result: ${event.subtype}, ${event.turns} turn(s), $${event.costUsd} — ${ms(started)}`);
    } else if (event.type === "turn-end") {
      finished();
    }
  },
  log: (message) => console.warn(message),
});

session.send(
  "Call the outline tool exactly once. Then reply with the word done.",
  { title: "Spike", blockId: "", outline: "", selection: null },
);
await done;
console.log(called ? `PASS  tool ${called.name} ${JSON.stringify(called.input)}` : "FAIL  tool never called");
if (!called) process.exitCode = 1;
