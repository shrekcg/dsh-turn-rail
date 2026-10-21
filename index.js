/**
 * dsh-turn-rail — host half.
 *
 * Intentionally empty: the rail is a pure browser-side enhancement. It reads
 * everything it needs from the DOM the Web GUI already renders (the
 * `[data-conversation-scroll]` viewport and the `data-chat-flow-kind` rows),
 * so it never needs a remote service, a host route, or access to the session
 * log. That is what keeps it working across DSH client API changes — the
 * three plugin attempts before it all died on a client-side `remote` service
 * that no longer exists in DSH 0.2.x.
 */

export const name = 'dsh-turn-rail'

/** No host services are required. */
export const inject = []

/** No-op host entry; the browser half lives in `./client`. */
export function apply() {}
