import { useEffect, useRef } from "react";
import type { PendingPermission, PermissionInteraction } from "../../workspace";
import { Button } from "../ui/button";

interface PermissionDialogProps {
  interaction: PermissionInteraction;
  pending: PendingPermission | null;
}

export function PermissionDialog({
  interaction,
  pending
}: PermissionDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const reject = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (!pending) {
      if (element.open) element.close();
      return;
    }
    try {
      if (!element.open) element.showModal();
      reject.current?.focus();
    } catch {
      interaction.decide(pending.token, "denied");
    }
  }, [interaction, pending]);

  return (
    <dialog
      ref={dialog}
      className="permission-dialog"
      aria-labelledby="permission-dialog-title"
      aria-describedby="permission-dialog-description"
      onCancel={(event) => event.preventDefault()}
      onClose={() => {
        if (pending) interaction.decide(pending.token, "denied");
      }}
    >
      {pending && (
        <div className="permission-dialog-content">
          <p className="eyebrow">Permission required</p>
          <h2 id="permission-dialog-title">Review this action</h2>
          <p id="permission-dialog-description">
            This action requires your permission before it can continue.
          </p>
          <dl className="permission-details">
            <div>
              <dt>Permission</dt>
              <dd>{pending.permission}</dd>
            </div>
            {pending.tool && (
              <div>
                <dt>Tool</dt>
                <dd>{pending.tool}</dd>
              </div>
            )}
            {pending.resource && (
              <div>
                <dt>File</dt>
                <dd>{pending.resource}</dd>
              </div>
            )}
          </dl>
          <div className="permission-actions">
            <Button
              ref={reject}
              type="button"
              variant="outline"
              onClick={() => interaction.decide(pending.token, "denied")}
            >
              Reject
            </Button>
            <Button
              type="button"
              onClick={() => interaction.decide(pending.token, "granted")}
            >
              Approve
            </Button>
          </div>
        </div>
      )}
    </dialog>
  );
}
