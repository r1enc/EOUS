import type {
  PermissionApprovalHandler,
  PermissionDecision,
  PermissionRequest,
  PermissionResponse
} from "../permission";

export interface PendingPermission {
  token: number;
  permission: string;
  tool?: string;
  resource?: string;
}

export interface PermissionInteraction {
  handle: PermissionApprovalHandler;
  getPending: () => PendingPermission | null;
  subscribe: (listener: () => void) => () => void;
  decide: (token: number, decision: PermissionDecision) => boolean;
}

interface PendingEntry {
  view: PendingPermission;
  requestId: string;
  resolve: (response: PermissionResponse) => void;
}

function describe(
  request: PermissionRequest,
  token: number
): PendingPermission {
  const view: PendingPermission = {
    token,
    permission: request.permission.name
  };
  const context = request.permission.context;
  const tool = context?.toolId;
  if (typeof tool !== "string" || !/^[a-z0-9-]{1,80}$/i.test(tool)) return view;
  view.tool = tool;
  if (tool !== "text-reader" && tool !== "pdf-reader") return view;
  const input = context?.input;
  if (typeof input !== "object" || input === null || Array.isArray(input))
    return view;
  const path = (input as Record<string, unknown>).filePath;
  const safeFile =
    tool === "pdf-reader"
      ? /^[a-z0-9][a-z0-9._-]{0,119}\.pdf$/i
      : /^[a-z0-9][a-z0-9._-]{0,119}\.(txt|log|md)$/i;
  if (typeof path === "string" && safeFile.test(path)) view.resource = path;
  return view;
}

export function createPermissionInteraction(): PermissionInteraction {
  const listeners = new Set<() => void>();
  let pending: PendingEntry | null = null;
  let nextToken = 0;

  function notify() {
    let delivered = false;
    for (const listener of listeners) {
      try {
        listener();
        delivered = true;
      } catch {
        // An unusable subscriber must not strand the approval Promise.
      }
    }
    return delivered;
  }

  function settle(entry: PendingEntry, decision: PermissionDecision): boolean {
    if (pending !== entry) return false;
    pending = null;
    notify();
    entry.resolve({ requestId: entry.requestId, decision });
    return true;
  }

  return {
    handle(request) {
      if (pending || listeners.size === 0)
        return Promise.resolve({ requestId: request.id, decision: "denied" });
      return new Promise((resolve) => {
        pending = {
          view: describe(request, ++nextToken),
          requestId: request.id,
          resolve
        };
        if (!notify() && pending) settle(pending, "denied");
      });
    },
    getPending: () => pending?.view ?? null,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        if (!listeners.delete(listener)) return;
        const orphan = pending;
        if (!orphan) return;
        // StrictMode reattaches during effect replay. Check after that replay,
        // and never let an old cleanup decide a subsequent request.
        queueMicrotask(() => {
          if (listeners.size === 0 && pending === orphan)
            settle(orphan, "denied");
        });
      };
    },
    decide(token, decision) {
      const current = pending;
      if (!current || current.view.token !== token) return false;
      return settle(current, decision);
    }
  };
}
