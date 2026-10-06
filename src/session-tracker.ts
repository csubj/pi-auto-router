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

export function createSessionTracker() {
  // Insertion order is recency order: update() moves a session to the end.
  const live = new Map<string, any>();
  let currentId: string | undefined;
  let lastRegistry: any;

  return {
    /** Store the context of a session event, and make its session current. */
    update(ctx: any): void {
      const registry = read(() => ctx?.modelRegistry);
      if (registry) lastRegistry = registry;
      const id = sessionIdOf(ctx);
      if (!id) return;
      live.delete(id);
      live.set(id, ctx);
      currentId = id;
    },

    /**
     * Remove the session of an ended context. The most recent live session
     * becomes current. Returns the id of the ended session.
     */
    end(ctx: any): string | undefined {
      const id = sessionIdOf(ctx);
      if (!id) return undefined;
      live.delete(id);
      if (currentId === id) currentId = [...live.keys()].at(-1);
      return id;
    },

    context(): any {
      return currentId === undefined ? undefined : live.get(currentId);
    },

    sessionId(): string | undefined {
      return currentId;
    },

    hasLiveSessions(): boolean {
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
