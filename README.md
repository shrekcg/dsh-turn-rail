<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="dsh-turn-rail — a turn rail on the left edge of a long conversation: one tick per question, hover to preview, click to jump">
</p>

<p align="center">
  <a href="#install"><img alt="install" src="https://img.shields.io/badge/dsh%20plugin%20add-dsh--turn--rail-4a7dff"></a>
  <img alt="platform" src="https://img.shields.io/badge/DSH%20Web%20UI-0.2.x-informational">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-3fb950">
  <img alt="deps" src="https://img.shields.io/badge/runtime%20deps-0-3fb950">
</p>

<p align="center">
  <b>Finding the question you asked ten turns ago should not depend on luck.</b><br>
  A rail of ticks on the left edge — hover to preview, click to jump.
</p>

## See it

<p align="center">
  <img src="./assets/readme/tour-hover.png" width="76%" alt="Hovering the 12th tick: a card labelled turn 12 shows the question text and a jump hint">
</p>

<p align="center">
  <sub>Hover any tick — it grows, its two neighbours grow slightly; the card shows the turn number and the question.</sub>
</p>

<p align="center">
  <img src="./assets/readme/tour-progress.png" width="34%" alt="Dragging the scroll bar on the far left: the blue thumb follows the position">
</p>

<p align="center">
  <sub>The thin bar on the far left: drag or click to scroll proportionally.</sub>
</p>

## What it solves

`Ctrl+F` finds words, not places. To get back to a question from three steps ago you scroll up until something looks familiar.

**dsh-turn-rail** puts a column of short ticks on the left edge of the conversation: **one tick = one message you sent.** Hover to see what you asked, click to go there. That is the whole product — no settings, no panel, no background work.

### Four details that matter

| | |
|---|---|
| **Jumps even when the target is unloaded** | History is a virtualised list; turns you scrolled past are not in the DOM. Clicking drives the host's own "load earlier" paging until that page is back, then locates the turn (6 s budget, stops as soon as the button disappears) |
| **Never jumps to the wrong duplicate** | Turn identity comes from the message anchor `data-chat-anchor-key`, not from matching text |
| **Shows where you are** | The turn you are reading stays a long blue tick and moves as you scroll |
| **Never covers your text** | If the rail would overlap a message it shifts left by up to 14 px, and only hides as a last resort |

## Install

```sh
dsh plugin --profile web add https://github.com/shrekcg/dsh-turn-rail
```

Hard-refresh the browser afterwards (Cmd/Ctrl + Shift + R).

> Replace `web` with your profile name — the desktop app usually uses `desktop`.

## Why it is this small

The design constraint is **not being orphaned by the host**.

Most plugins in this space read history the same way: client-side `inject: [..., 'remote']` → RPC into the session log. DSH 0.2.x changed that client surface, and that path stopped working — the symptom is a plugin that installs cleanly and renders nothing.

`dsh-turn-rail` depends on only two things that have stayed stable in the UI layer:

```text
[data-conversation-scroll]                  the conversation viewport
[data-chat-flow-kind="user"|"steering"]     the messages you sent
```

Paging reuses the host's own "load earlier" button — it never reads the log or makes its own requests. No host services, no background process, no settings panel, no storage.

## Boundaries

- Renders only in the Web GUI's conversation view; hides itself on the trajectory / subagent views.
- History removed by host compaction is not in the DOM, so it gets no tick — the rail never invents history.
- If the host renames the two DOM contracts above, the rail silently does not render (no errors, conversation unaffected). The fix point is the `SEL` constant at the top of [`lib/client.js`](./lib/client.js).

## Layout

```text
dsh-turn-rail/
├── package.json          # dsh.bundle + dsh.client manifest
├── cordis.patch.yml      # one mount row for the profile
├── index.js              # host half: intentionally empty (rail is browser-side)
├── lib/client.js         # all logic: styles, layout, hover, jump, progress
└── assets/readme/        # hero and screenshots
```

There is no build step: `lib/client.js` is the shipped artifact (`__ModuleLoader__.load` bundle format).

```sh
git clone https://github.com/shrekcg/dsh-turn-rail
dsh plugin --profile web add link:./dsh-turn-rail
# edit lib/client.js, restart DSH to apply
```

## License

[MIT](./LICENSE) © 2026 shrek wu · 中文说明见 [`README.zh.md`](./README.zh.md)
