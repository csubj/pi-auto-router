/**
 * Session state that all sessions in one process share.
 *
 * pi caches an extension module per working directory. The main session and
 * each in-process subagent session therefore run the same copy of this module.
 * A session that ends must remove only its own state. If it clears state for
 * all sessions, the next request of a live session finds no model registry.
 */

function read<T>(get: () => T): T | undefined {
  try {
    return get();
  } catch {
    // pi makes a context throw after its session ends.
    return undefined;
  }
}

export function sessionIdOf(ctx: any): string | undefined {
  return read(() => ctx?.sessionManager?.getSessionId?.());
}

/**
 * onEnd receives the id of each session that ends. This includes a session
 * whose context became stale without a session_shutdown event.
 */
export function createSessionTracker(onEnd: (sessionId: string) => void = () => {}) {
  // Insertion order is recency order: update() moves a session to the end.
  const live = new Map<string, any>();
  let lastRegistry: any;

  const remove = (id: string) => {
    live.delete(id);
    onEnd(id);
  };

  // pi-subagents can dispose a child without session_shutdown. Its context
  // then throws, or it reports a different session id after a replacement.
  const prune = () => {
    for (const [id, ctx] of live) {
      if (sessionIdOf(ctx) !== id) remove(id);
    }
  };

  return {
    /** Store the context of a session event, and make its session current. */
    update(ctx: any): void {
      const registry = read(() => ctx?.modelRegistry);
      if (registry) lastRegistry = registry;
      prune();
      const id = sessionIdOf(ctx);
      if (!id) return;
      live.delete(id);
      live.set(id, ctx);
    },

    /**
     * Remove the session of an ended context, and every stale session. The
     * most recent live session becomes current. pi makes a new context object
     * for each event, but it invalidates all contexts of a session together.
     * So if the ended context is stale, prune() removes its stored context.
     */
    end(ctx: any): void {
      const id = sessionIdOf(ctx);
      if (id) remove(id);
      prune();
    },

    context(): any {
      prune();
      return [...live.values()].at(-1);
    },

    sessionId(): string | undefined {
      prune();
      return [...live.keys()].at(-1);
    },

    hasLiveSessions(): boolean {
      prune();
      return live.size > 0;
    },

    /**
     * The registry of the current context. If no context gives one, the last
     * registry that any context gave. A ModelRegistry wraps the process model
     * runtime, so it stays valid after its session ends.
     */
    registry(): any {
      return read(() => this.context()?.modelRegistry) ?? lastRegistry;
    },
  };
}
