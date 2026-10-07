# Zamily Feud

A real-time multiplayer party game inspired by Family Feud, designed to run alongside Zoom.

## Status

**Phase 0 + 1 (foundation) and Phase 2 (dataset) complete.**

- Monorepo scaffolding, shared types/events, an in-memory ephemeral room store, and a
  Socket.io server + Next.js client that can create a room, join it by code, split players
  across two teams, and toggle ready state live.
- Postgres/pgvector schema (`database/migrations/0001_init.sql`) and an idempotent import +
  embedding pipeline for the question/answer dataset — see `docs/dataset.md` for the model
  choice, thresholds, and how to run it once you have a Postgres/Supabase instance.

Everything else in `docs/` describes where the project is going; only what's listed above
actually runs today. Phase 2 was verified end-to-end against a throwaway local Postgres
container (import, embed, and a scoped vector-similarity query all confirmed correct), but
that container was torn down — you still need your own Postgres/Supabase instance and
`DATABASE_URL` to run the dataset scripts yourself.

## Structure

```
apps/
  web/      Next.js + TypeScript + Tailwind client
  server/   Express + Socket.io backend (authoritative game state)
packages/
  shared/   Types and Socket.io event contracts shared by both apps
database/
  seed/source/FamilyFeud_Questions.json   raw dataset, not yet imported
  migrations/                              Supabase/Postgres schema (Phase 2)
docs/                                       architecture notes, added per phase
```

## Requirements

- Node.js >= 20
- npm (workspaces are used instead of a separate monorepo tool)

## Setup

```bash
npm install
cp .env.example .env
cp apps/web/.env.local.example apps/web/.env.local
```

## Running

```bash
npm run dev:server   # http://localhost:4000
npm run dev:web       # http://localhost:3000
```

Open two browser windows on `http://localhost:3000`: create a room in one, join with the
printed room code in the other, and both should see live team/lobby updates.

## Verifying

```bash
npm run typecheck
npm test
```

## AI Host mode

When creating a room, pick **AI host** (and a humor style: Family friendly, Sassy, Millennial,
or Gen Z — each a complete personality, one file each in `apps/server/src/host/personas/`). The room creator then plays on a team like everyone else and manages the lobby, and
an AI agent on the server runs the whole game: it starts questions, reads them out, judges
every answer, calls strikes, breaks face-off stalemates, moves between rounds, ends the game,
and supplies the jokes. Its lines appear in a speech bubble and are read aloud by the
browser's built-in voice (players can mute it).

- **Agent:** `apps/server/src/host/`. `AiHostDirector` watches each AI room and works out
  which moment needs the host; `ClaudeHostBrain` runs a Claude tool-use loop where the only
  tools on offer are the moves that are legal right now, and each tool takes the line to say.
  Moves go through the same `RoomStore` methods a human host uses.
- **Setup:** put an Anthropic key in `LLM_API_KEY` (model from `LLM_MODEL`, default
  `claude-haiku-4-5` for snappy turns). `AI_HOST_ROUNDS` sets the game length.
- **Chat + team mic:** AI rooms have a shared chat (lobby and game) where players talk to each
  other and the host, who replies when addressed and riffs on the conversation. Each team has one
  "Talk to host" mic: the holder's live voice streams to every other player's browser over WebRTC
  (the server only relays connection setup, never audio), and their speech is transcribed into the
  chat so the host can answer. Voice needs `https` or `localhost`; STUN covers most home networks,
  and `NEXT_PUBLIC_ICE_SERVERS` can add a TURN relay for strict ones.
- **Steal huddle:** after three strikes the stealing team gets a private huddle (20s, `STEAL_TIMER_SECONDS`)
  with a team-only chat and a "Discussion is done" button. The server delivers huddle messages to that
  team only, and their mic audio and transcripts stay inside the team while they confer.
- **Live from the lobby:** the host greets the room creator as soon as the room opens, welcomes each
  arrival, and riffs on team renames and shuffles, all in the chosen persona's voice.
- **Exit:** every screen has an Exit button with an are-you-sure dialog. The host jokes about the exit
  (never the person). A face-off answerer who leaves counts as a miss, the captaincy and room ownership
  pass on, a team left empty ends the game by forfeit, and a human host leaving closes the room.
- **Pictures:** players can upload a photo or take a selfie in the lobby. It's shrunk to a small
  thumbnail in the browser, kept only in server memory, and deleted with the room.
- **No key / slow model:** a built-in canned host (rule-based judging on the answer matcher,
  joke banks per humor style in `cannedBrain.ts`) runs the game on its own. With a key it's only
  a last resort: if Claude times out (`LLM_TIMEOUT_MS`), errors, or doesn't make a required move,
  Claude gets a second try, and the canned host steps in only if that fails too. The game never
  stalls waiting on the AI.

## Ephemeral data

Everything under `RoomSession` (players, teams, scores, board state) lives only in the
server's in-memory `RoomStore`. A background sweep destroys any room that's been idle past
`ROOM_TTL_SECONDS` (default 1 hour), and `destroyRoom()` removes it completely — no player or
gameplay data is ever written to a database. The only permanent store (Supabase/Postgres,
added in Phase 2) holds the read-only question/answer dataset.

## Roadmap

See the phase breakdown in `docs/` (added as each phase lands): dataset import + pgvector
(Phase 2), the answer-matching engine (Phase 3), the game engine state machine (Phase 4),
full realtime sync (Phase 5), the game UI (Phase 6), the AI host + TTS (Phase 7), then
Fast Money, security hardening, and polish (Phase 8).
