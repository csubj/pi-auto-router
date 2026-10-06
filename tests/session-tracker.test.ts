import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createSessionTracker } from "../src/session-tracker.ts";

const registry = { getAvailable: () => [{ provider: "my-provider", id: "vendor-a/model-1" }] };

// A fake pi ExtensionContext. Like pi, it throws after its session ends.
function fakeContext(id: string) {
  let stale = false;
  const ctx = {
    get sessionManager() {
      if (stale) throw new Error("This extension ctx is stale");
      return { getSessionId: () => id };
    },
    get modelRegistry() {
      if (stale) throw new Error("This extension ctx is stale");
      return registry;
    },
  };
  return { ctx, invalidate: () => { stale = true; } };
}

describe("session-tracker", () => {
  it("keeps the main session current when a subagent session ends", () => {
    const sessions = createSessionTracker();
    const main = fakeContext("main");
    const child = fakeContext("child");
    sessions.update(main.ctx);
    sessions.update(child.ctx);
    assert.equal(sessions.sessionId(), "child");

    assert.equal(sessions.end(child.ctx), "child");
    child.invalidate();

    assert.equal(sessions.sessionId(), "main");
    assert.equal(sessions.context(), main.ctx);
    assert.equal(sessions.registry(), registry);
    assert.equal(sessions.hasLiveSessions(), true);
  });

  it("keeps the current session when a session that is not current ends", () => {
    const sessions = createSessionTracker();
    const main = fakeContext("main");
    const child = fakeContext("child");
    sessions.update(child.ctx);
    sessions.update(main.ctx);
    sessions.end(child.ctx);
    assert.equal(sessions.sessionId(), "main");
  });

  it("returns the last registry after every session ends", () => {
    const sessions = createSessionTracker();
    const main = fakeContext("main");
    sessions.update(main.ctx);
    sessions.end(main.ctx);
    main.invalidate();
    assert.equal(sessions.hasLiveSessions(), false);
    assert.equal(sessions.context(), undefined);
    assert.equal(sessions.sessionId(), undefined);
    assert.equal(sessions.registry(), registry);
  });

  it("returns the last registry when the current context is stale", () => {
    const sessions = createSessionTracker();
    const child = fakeContext("child");
    sessions.update(child.ctx);
    // pi-subagents disposes a child even when its shutdown hooks time out.
    child.invalidate();
    assert.equal(sessions.registry(), registry);
  });

  it("ignores a stale context", () => {
    const sessions = createSessionTracker();
    const main = fakeContext("main");
    const stale = fakeContext("old");
    stale.invalidate();
    sessions.update(main.ctx);
    sessions.update(stale.ctx);
    assert.equal(sessions.end(stale.ctx), undefined);
    assert.equal(sessions.sessionId(), "main");
  });
});
