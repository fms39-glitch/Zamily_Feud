# Zamily Feud

A real-time multiplayer party game inspired by Family Feud, designed to run alongside Zoom.

## Status

**Phase 0 + Phase 1 complete** (foundation): monorepo scaffolding, shared types/events, an
in-memory ephemeral room store, and a minimal Socket.io server + Next.js client that can
create a room, join it by code, split players across two teams, and toggle ready state live.

Everything else in `docs/` describes where the project is going; only what's listed above
actually runs today.

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
