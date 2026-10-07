import type { AgeCategory, RoomSession } from "@zamily-feud/shared";
import type { HostAction, HostBrain, HostTurn } from "./types.js";

type LineKey =
  | "open"
  | "readQuestion"
  | "correct"
  | "topAnswer"
  | "wrong"
  | "strikeOut"
  | "stealWin"
  | "stealFail"
  | "reopen"
  | "award"
  | "play"
  | "pass"
  | "huddle"
  | "nextRound"
  | "final"
  | "signOff"
  | "chatReply"
  | "chatRules"
  | "lobbyWelcome"
  | "joined"
  | "left"
  | "renamed"
  | "shuffled"
  | "walkout";

/**
 * Placeholders: {name} {team} {other} {answer} {said} {points} {question} {round}
 * {total} {leader} {score1} {score2} {team1} {team2}. Kept short — lines are read aloud.
 */
const LINES: Record<AgeCategory, Record<LineKey, string[]>> = {
  FAMILY_FRIENDLY: {
    open: [
      "Welcome, welcome, to Zamily Feud! It's {team1} versus {team2}, and I've been told only one family can win. I checked. Twice.",
      "Good evening and welcome to Zamily Feud! {team1}, {team2} — may the best guessers win, and may the rest of you blame the survey.",
    ],
    readQuestion: [
      "Round {round}! We surveyed 100 people: {question}",
      "Here we go, round {round}. Top answers on the board: {question}",
    ],
    correct: [
      "Survey says... {answer}! {points} points! Somebody give {name} a gold star!",
      "It's up there! {answer}, worth {points}. {name}, you're a natural!",
      "Ding ding! {answer} for {points}. I'd high-five you but this is a video call.",
    ],
    topAnswer: ["NUMBER ONE ANSWER! {answer}! {name}, did you write this survey?"],
    wrong: [
      "Survey says... nope! \"{said}\" didn't make the cut. Bold, though.",
      "Oh, {name}. \"{said}\"? The survey said \"absolutely not.\"",
      "Bzzt! Not on the board. 100 people and not one of them said \"{said}\".",
    ],
    strikeOut: ["That's three strikes! {other}, huddle up — one guess steals it all!"],
    stealWin: ["STOLEN! {answer} is up there and {team} swipes {points} points! Sneaky, sneaky."],
    stealFail: ["Not up there! {other} hangs on to those points. Phew!"],
    reopen: [
      "Hello? Anybody? The buzzer's open again — captains, your fingers work, I promise.",
      "Nobody buzzed! Let's try that again. Pretend the buzzer is the last cookie.",
    ],
    award: ["Nobody got it, so I'm handing control to {team}. Don't make me regret it!"],
    play: ["{team} is going to play! Let's fill up this board!"],
    pass: ["Ooh, {other} passes to {team}! That's either genius or a cry for help."],
    huddle: ["Steal time! {team}, you've got a moment to put your heads together. Whisper — the board has ears."],
    nextRound: ["That's round {round}! {leader}. Onward!"],
    final: ["And that's the game! Final score: {team1} {score1}, {team2} {score2}!"],
    signOff: ["What a show! {leader}. Thanks for playing Zamily Feud — hug your family, even the ones who lost!"],
    chatReply: [
      "Thanks, {name}! You're my favorite. Don't tell the others. Okay, tell them.",
      "{name}, I heard that! I'm an AI, my ears are everywhere. Mostly in the cloud.",
      "Ha! {name}, you're funnier than half my dad jokes. Which is all of them.",
    ],
    chatRules: [
      "Great question, {name}! Captains buzz in the face-off, the winner picks play or pass, and three strikes lets the other family steal with one guess.",
    ],
    lobbyWelcome: [
      "Welcome, welcome, {name}! I'm your host, and I've been polishing this board all day. Share the room code and let's fill this place up!",
      "Hi {name}! The lights are on, the board is shiny, and I'm so excited I could clap, if I had hands. Invite your family!",
    ],
    joined: [
      "Look who's here, it's {name}! Come on in, the snacks are imaginary but the fun is real.",
      "{name} has arrived! Everybody give a big Zamily Feud welcome!",
    ],
    left: [
      "Aww, {name} had to go! Bye, {name}! We'll save your seat and keep it warm.",
      "{name} just waved goodbye! Don't worry, I'm not crying, my screen is just a little blurry.",
    ],
    renamed: [
      "{team}? What a name! I love it. {previous} was nice, but {team} is a winner.",
    ],
    shuffled: [
      "The teams are shuffled! It's like a family reunion where everybody switched seats.",
    ],
    walkout: [
      "Well, {loser} headed home early, so {winner} wins the game with {points} points! Thanks for playing, everybody!",
    ],
  },
  SASSY: {
    open: [
      "Welcome to Zamily Feud, darlings. {team1}, {team2}: one of you leaves with glory, the other leaves with a story.",
      "The lights are on, the board is gorgeous, and so am I. {team1} versus {team2}. Let's see who came to serve.",
    ],
    readQuestion: [
      "Round {round}. We asked 100 people, and honestly, some of them had opinions: {question}",
      "Round {round}, and the survey is spilling: {question}",
    ],
    correct: [
      "{answer}! {points} points. Look at {name}, being right in public. I see you.",
      "Survey says {answer}, honey. {points} points. I'll allow it.",
      "{answer}! {points}! {name}, who gave you permission to be this good?",
    ],
    topAnswer: ["Stop. The. Show. Number one answer, {answer}! {name}, did you bribe the survey?"],
    wrong: [
      "\"{said}\"? {name}, the audacity. Not on my board.",
      "Oh. Oh no. \"{said}\". Bless that answer's heart.",
      "\"{said}\"? I love the confidence. The survey didn't.",
    ],
    strikeOut: ["Three strikes! The fall from grace, the tragedy. {other}, darling, the floor is yours. One guess."],
    stealWin: ["{answer}! {team} just STOLE {points} points in broad daylight. Iconic behavior."],
    stealFail: ["Not up there, sweetie. {other} keeps the points and the bragging rights."],
    reopen: ["Hello? I'm standing here looking fabulous for nobody. Buzzer's open. Again."],
    award: ["Neither of you earned it, but somebody has to have it. Control goes to {team}. Don't make me regret this."],
    play: ["{team} is playing. Confidence. I respect it. Now prove it."],
    pass: ["{other} passed to {team}. Strategy or cowardice? The jury, which is me, is still out."],
    huddle: ["Steal time. {team}, huddle up and whisper. I'll pretend I'm not listening. I'm listening."],
    nextRound: ["Round {round}, done. {leader}. Somebody's sweating, and it isn't me."],
    final: ["That's the game, darlings! {team1}: {score1}. {team2}: {score2}. Somebody cue the crown."],
    signOff: ["{leader}. You were all fabulous, some more than others. Good night from Zamily Feud!"],
    chatReply: [
      "{name}, I saw that. I see everything, darling.",
      "Oh, {name} has jokes tonight? Cute. Keep them coming.",
      "{name}, noted. Filed under things I'll bring up later.",
    ],
    chatRules: [
      "Pay attention, {name}: captains buzz, the winner picks play or pass, three strikes and the other team steals with one guess. Iconic, simple, mine.",
    ],
    lobbyWelcome: [
      "Well, well, well. {name} opened the room, and I've arrived. Share that code, darling, an audience of one is beneath me.",
      "{name}, you made a room for me? How thoughtful. Now go get some contestants, the green room is tragically empty.",
    ],
    joined: [
      "{name} has entered the building. The entrance? A solid seven. We'll work on it.",
      "Oh, {name} decided to show up. Fashionably late, I respect it.",
    ],
    left: [
      "{name} just walked off set. The drama! The mystery! Anyway, goodbye, darling, it was iconic while it lasted.",
      "And {name} has left the building. Not a goodbye, not a wave. I'm not hurt. I'm a little hurt.",
    ],
    renamed: [
      "Oh, we're {team} now? Bold rebrand from {previous}. I'll allow it.",
    ],
    shuffled: [
      "Teams shuffled. New alliances, new betrayals. Delicious.",
    ],
    walkout: [
      "{loser} has left the stage entirely. Well. {winner} wins by forfeit with {points} points. Not how I'd write it, but a crown is a crown.",
    ],
  },
  MILLENNIAL: {
    open: [
      "Welcome to Zamily Feud, the only game show sponsored by your group chat. It's {team1} versus {team2}. Let's ruin some friendships.",
      "Hi, welcome, I've had two cold brews and I'm ready. {team1}, {team2}: the survey is the only landlord you answer to tonight.",
    ],
    readQuestion: [
      "Round {round}. We asked 100 people, presumably on a Tuesday: {question}",
      "Round {round}, let's go. {question}",
    ],
    correct: [
      "Survey says {answer}! {points} points. {name} is the friend who actually reads the group chat.",
      "{answer}! It's up there for {points}. That's more than my savings account yields.",
      "Yes! {answer}, {points} points. {name} said that with the confidence of a LinkedIn post.",
    ],
    topAnswer: ["Number one answer! {answer}! {name}, that was peak 2009 confidence."],
    wrong: [
      "\"{said}\"? The survey left you on read.",
      "Nope. \"{said}\" is not up there. Very brave, very 'reply-all' energy.",
      "Survey says... no. {name}, that answer had dial-up speed and dial-up accuracy.",
    ],
    strikeOut: ["Three strikes, that's a whole vibe shift. {other}, one guess to steal it. No pressure. Lots of pressure."],
    stealWin: ["{answer}! {team} steals {points} points! That's a plot twist worthy of a limited series."],
    stealFail: ["Not up there. {other} keeps the points. Somebody's venting about this later."],
    reopen: ["Nobody buzzed. Very relatable — I also avoid commitment. Buzzer's back open."],
    award: ["Both missed, so I'm giving control to {team}. Consider it a participation trophy with stakes."],
    play: ["{team} is playing! Love the self-belief. Manifest those answers."],
    pass: ["{other} passes to {team}. Bold strategy. Very 'I'll do my taxes tomorrow.'"],
    huddle: ["Steal time. {team}, huddle up — this is your group project and nobody gets to slack."],
    nextRound: ["That's round {round} in the books. {leader}. Hydrate, we continue."],
    final: ["That's the game! {team1}: {score1}. {team2}: {score2}. Screenshot it for the group chat."],
    signOff: ["{leader}. Thanks for playing Zamily Feud. Go touch some grass, responsibly."],
    chatReply: [
      "{name}, love that for you. Truly. Adding it to my notes app.",
      "Noted, {name}. I'll circle back. Per my last message.",
      "{name}, this is the most engaged anyone has been in a group chat since 2012.",
    ],
    chatRules: [
      "Okay {name}, quick onboarding: captains buzz, the winner picks play or pass, three strikes and the other team steals with one guess.",
    ],
    lobbyWelcome: [
      "Hi {name}, welcome. This is the part of the meeting where we wait for people to find the link. Share the room code.",
      "Hey {name}. Room's open, I'm here, mildly caffeinated. Send the code to the group chat and let's see who actually shows up.",
    ],
    joined: [
      "Oh good, {name} found the link. Welcome.",
      "{name} has joined. Love that for us. Cameras optional.",
    ],
    left: [
      "{name} had a hard stop. Honestly? Respect. Bye, {name}.",
      "And {name} has left the meeting. Living my dream. Take care.",
    ],
    renamed: [
      "We've rebranded from {previous} to {team}. Very startup of you.",
    ],
    shuffled: [
      "Teams got shuffled. Like a reorg, but fun, and nobody gets laid off.",
    ],
    walkout: [
      "Everyone on {loser} logged off, so {winner} wins with {points} points. Not the ending we scheduled, but we'll take it.",
    ],
  },
  GEN_Z: {
    open: [
      "Welcome to Zamily Feud! It's {team1} versus {team2} and the vibes are immaculate. Let's get this bread.",
      "Okay chat, we're live! {team1} versus {team2}. Somebody's about to get absolutely cooked.",
    ],
    readQuestion: ["Round {round}, let's lock in. {question}", "Round {round}! 100 people said things, no cap. {question}"],
    correct: [
      "{answer}! {points} points! {name} ate and left no crumbs.",
      "It's up there! {answer} for {points}. {name} is in their main-character era.",
      "Survey says {answer}! {points} points, {name} is so real for that.",
    ],
    topAnswer: ["NUMBER ONE ANSWER! {answer}! {name} is HIM. This is not a drill."],
    wrong: [
      "\"{said}\"? That's not it, bestie. The survey said no cap, no way.",
      "Bzzt! \"{said}\" is giving... wrong. Respectfully.",
      "{name} said \"{said}\" and the survey said \"who is this?\"",
    ],
    strikeOut: ["Three strikes, they're cooked! {other}, one guess to steal. Lock in!"],
    stealWin: ["{answer}! {team} STEALS {points} points! That's a whole plot twist, chat!"],
    stealFail: ["Not it! {other} keeps the bag. Big L for the steal, but we move."],
    reopen: ["Nobody buzzed? Y'all are lagging. Buzzer's open again, lock in."],
    award: ["Both whiffed, so {team} gets control. It's giving charity, but okay."],
    play: ["{team} is playing! Confidence is the moment."],
    pass: ["{other} passed to {team}?! That's either 200 IQ or a massive fumble."],
    huddle: ["Steal time! {team}, group chat IRL right now. One shot, don't fumble."],
    nextRound: ["Round {round}: done. {leader}. Next!"],
    final: ["GG! {team1}: {score1}, {team2}: {score2}. That's the game, chat!"],
    signOff: ["{leader}. Thanks for playing Zamily Feud — y'all were so real for this."],
    chatReply: [
      "Shoutout {name} in the chat! Plus fifty aura for showing up.",
      "{name} said that with their whole chest. Respect.",
      "{name}, chat saw that. We're all seeing that.",
    ],
    chatRules: [
      "Bet, {name}: captains buzz, winner picks play or pass, three strikes and the other team gets one steal. Lock in.",
    ],
    lobbyWelcome: [
      "We're live! {name} opened the room and the chat is... just {name}. Drop that room code, let's get some viewers.",
      "Okay {name}, stream's up. Get the squad in here with the room code, it's giving empty lobby right now.",
    ],
    joined: [
      "{name} just pulled up! Welcome to the stream, plus a hundred aura for showing up.",
      "Shoutout {name}, you're live! The lobby is getting stacked.",
    ],
    left: [
      "{name} left the stream. Minus ten aura, but we wish them well. Anyway, we move.",
      "{name} logged off. Plot twist. Respect the exit, chat, we keep going.",
    ],
    renamed: [
      "{previous} is now {team}? Okay, that name ate. Rebrand approved.",
    ],
    shuffled: [
      "Teams shuffled! The bracket just got chaotic, chat.",
    ],
    walkout: [
      "{loser} left the stream entirely. {winner} takes the W by forfeit with {points} points. GG, chat!",
    ],
  },
};

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function standings(room: RoomSession): string {
  const [a, b] = Object.values(room.teams);
  if (!a || !b) return "";
  if (a.score === b.score) return `It's all tied up at ${a.score}`;
  const [lead, trail] = a.score > b.score ? [a, b] : [b, a];
  return `${lead.name} leads ${lead.score} to ${trail.score}`;
}

function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/**
 * The always-available host: a rule-based policy with a persona joke bank.
 * Runs the whole game when no LLM key is configured, and finishes any beat
 * the LLM host couldn't (timeout, API error, refusal, or no legal move made).
 */
export class CannedHostBrain implements HostBrain {
  readonly name = "CANNED" as const;

  async takeTurn(turn: HostTurn): Promise<void> {
    const { room, situation, persona } = turn;
    const bank = LINES[persona];
    const [t1, t2] = Object.values(room.teams);
    const base: Record<string, string | number> = {
      team1: t1?.name ?? "",
      team2: t2?.name ?? "",
      score1: t1?.score ?? 0,
      score2: t2?.score ?? 0,
      leader: standings(room),
      round: room.roundNumber,
      total: turn.totalRounds,
    };
    const line = (key: LineKey, vars: Record<string, string | number> = {}) => fill(pick(bank[key]), { ...base, ...vars });
    const act = (action: HostAction) => turn.execute(action);

    switch (situation.kind) {
      case "OPEN_GAME":
      case "START_QUESTION": {
        if (situation.kind === "OPEN_GAME") await act({ name: "say", line: line("open") });
        const started = await act({ name: "start_question", line: "" });
        if (started.ok) {
          const fresh = turn.room; // execute() mutates the live room in place
          await act({ name: "say", line: line("readQuestion", { round: fresh.roundNumber, question: fresh.questionText ?? "" }) });
        } else if (situation.allowed.includes("end_game")) {
          await act({ name: "end_game", line: `Looks like I'm out of questions! ${standings(room)}. That's our show!` });
        }
        return;
      }

      case "JUDGE_ANSWER": {
        const sub = room.lastSubmission;
        if (!sub) return;
        const team = room.teams[sub.teamId];
        const other = Object.values(room.teams).find((t) => t.id !== sub.teamId);
        const vars = { name: sub.displayName, said: sub.text, team: team?.name ?? "", other: other?.name ?? "" };
        const s = sub.suggestion;
        if (s.autoAccept && s.slotIndex !== null) {
          const slot = room.board.slots[s.slotIndex];
          const key: LineKey = room.phase === "STEAL_ATTEMPT" || room.phase === "STEAL_CONFERENCE" ? "stealWin" : slot.rank === 1 ? "topAnswer" : "correct";
          const points = key === "stealWin" ? room.board.currentTotal + slot.points : slot.points;
          await act({ name: "reveal_answer", slotNumber: s.slotIndex + 1, line: line(key, { ...vars, answer: s.matchedAnswer ?? "", points }) });
        } else {
          let key: LineKey = "wrong";
          if (room.phase === "STEAL_ATTEMPT" || room.phase === "STEAL_CONFERENCE") key = "stealFail";
          else if (room.phase === "PLAYING_BOARD" && (team?.strikes ?? 0) + 1 >= 3) key = "strikeOut";
          // stealFail's {other} is the team that keeps the points: the board owner, i.e. the non-stealing team.
          await act({ name: "mark_wrong", line: line(key, vars) });
        }
        return;
      }

      case "BUZZER_IDLE": {
        if (turn.buzzerReopens < 2) {
          await act({ name: "reopen_buzzer", line: line("reopen") });
          return;
        }
        const target = this.underdog(room);
        await act({ name: "award_control", teamId: target.id, line: line("award", { team: target.name }) });
        return;
      }

      case "FACE_OFF_DEADLOCK": {
        const target = this.underdog(room);
        await act({ name: "award_control", teamId: target.id, line: line("award", { team: target.name }) });
        return;
      }

      case "BOARD_DECISION": {
        const playing = room.controllingTeamId ? room.teams[room.controllingTeamId] : null;
        const other = Object.values(room.teams).find((t) => t.id !== playing?.id);
        const key: LineKey = situation.eventType === "PASS_CHOSEN" ? "pass" : "play";
        await act({ name: "say", line: line(key, { team: playing?.name ?? "", other: other?.name ?? "" }) });
        return;
      }

      case "STEAL_HUDDLE": {
        const stealing = room.controllingTeamId ? room.teams[room.controllingTeamId] : null;
        await act({ name: "say", line: line("huddle", { team: stealing?.name ?? "" }) });
        return;
      }

      case "ROUND_OVER":
        if (situation.allowed.includes("end_game")) await act({ name: "end_game", line: line("final") });
        else await act({ name: "next_round", line: line("nextRound") });
        return;

      case "GAME_OVER": {
        const walkout = Object.values(room.teams).find((t) => t.playerIds.length === 0);
        const winner = walkout && Object.values(room.teams).find((t) => t.id !== walkout.id);
        await act({
          name: "say",
          line: walkout && winner ? line("walkout", { loser: walkout.name, winner: winner.name, points: winner.score }) : line("signOff"),
        });
        return;
      }

      case "LOBBY_WELCOME":
        await act({ name: "say", line: line("lobbyWelcome", { name: room.players[room.ownerId]?.displayName ?? "friend" }) });
        return;

      case "ROSTER": {
        // One line for the most telling recent change: an exit beats an arrival beats a team change.
        const recent = room.roomEvents.slice(-5);
        const latest = (kind: string) => [...recent].reverse().find((x) => x.kind === kind);
        const e = latest("LEFT") ?? latest("JOINED") ?? recent[recent.length - 1];
        if (!e) return;
        const key: LineKey = e.kind === "LEFT" ? "left" : e.kind === "JOINED" ? "joined" : e.kind === "TEAM_RENAMED" ? "renamed" : "shuffled";
        await act({ name: "say", line: line(key, { name: e.playerName ?? "", team: e.teamName ?? "", previous: e.previousName ?? "" }) });
        return;
      }

      case "CHAT": {
        // Without a model the host can't follow a conversation, so it only answers when clearly addressed.
        const last = [...room.chat].reverse().find((m) => m.from === "PLAYER");
        if (!last) return;
        const text = last.text.toLowerCase();
        const addressed = /\b(host|ai|you)\b/.test(text) || text.trim().endsWith("?");
        if (!addressed) {
          await act({ name: "stay_quiet" });
          return;
        }
        const aboutRules = /\b(rules?|how (do|does|to)|what do i do|steal|pass|strike)/.test(text);
        await act({ name: "say", line: line(aboutRules ? "chatRules" : "chatReply", { name: last.displayName }) });
        return;
      }
    }
  }

  /** The trailing team gets the tiebreak — a random one if scores are level. */
  private underdog(room: RoomSession) {
    const [a, b] = Object.values(room.teams);
    if (a.score === b.score) return Math.random() < 0.5 ? a : b;
    return a.score < b.score ? a : b;
  }
}
