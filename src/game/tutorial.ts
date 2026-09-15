import { act, addPlayer, createGame, startGame } from "./engine";
import { catalog } from "./catalog";
import type { Game } from "./types";

export interface LessonStep {
  title: string;
  text: string;
  actor?: string;
  play?: string;
  choose?: string;
  pass?: boolean;
  button?: string;
}
// A curated deal, followed exclusively by legal actions in the real rules engine.
// Opponents deliberately leave room for learning; these are scripted practice bots.
export function createLessonGame() {
  const g = createGame("you", "You", 2718);
  addPlayer(g, "ember", "Ember");
  addPlayer(g, "fern", "Fern");
  g.players.slice(1).forEach((p) => {
    p.bot = "easy";
  });
  const chosen = [
    "serenity",
    "anger",
    "love",
    "tranquility",
    "discipline",
    "apathy",
  ];
  const deck = [
    ...chosen,
    ...catalog.map((c) => c.id).filter((id) => !chosen.includes(id)),
  ].slice(0, 45);
  startGame(g, "you", "retail", deck);
  for (const card of g.cards) {
    card.zone = "deck";
    card.owner = "";
  }
  const deal = (id: string, owner: string) => {
    const c = g.cards.find((c) => c.def === id)!;
    c.zone = "hand";
    c.owner = owner;
  };
  chosen.slice(0, 4).forEach((id) => deal(id, "you"));
  deal("discipline", "ember");
  deal("apathy", "fern");
  for (const player of g.players)
    while (g.cards.filter((c) => c.owner === player.id).length < 5)
      deal(g.cards.find((c) => c.zone === "deck")!.def, player.id);
  g.deck = g.cards.filter((c) => c.zone === "deck").map((c) => c.uid);
  g.order = ["you", "ember", "fern"];
  g.turnIndex = 0;
  return g;
}
export const lesson: LessonStep[] = [
  {
    title: "A feeling to start with",
    text: "You each start with five cards. Tap Serenity in your hand, then play it. With one mood in play, it is worth 3 points.",
    actor: "you",
    play: "serenity",
  },
  {
    title: "Your mood stays on the table",
    text: "You have used your normal play. End your turn to let the others play. Cards stay in play between rounds.",
    actor: "you",
    pass: true,
  },
  {
    title: "Ember plays Discipline",
    text: "Discipline is worth 6 while there are fewer than two black or red moods. Watch Ember’s points change.",
    actor: "ember",
    play: "discipline",
  },
  {
    title: "Over to Fern",
    text: "Ember ends their turn. Each player gets a turn before scoring.",
    actor: "ember",
    pass: true,
  },
  {
    title: "Fern plays Apathy",
    text: "Apathy is a simple mood worth 4 points, with no extra effect.",
    actor: "fern",
    play: "apathy",
  },
  {
    title: "Time to count",
    text: "Fern finishes the last turn of the round. The game counts everyone’s moods automatically.",
    actor: "fern",
    pass: true,
  },
  {
    title: "Meet Hurt Feelings",
    text: "Ember wins with 6; Fern has 4 and you have 3. Each loser draws a card. With three or four players, the lowest scorer also gets one extra play on their next turn. That’s you! Ember starts the next round.",
    button: "Try the extra play",
  },
  {
    title: "Ember passes",
    text: "Playing is optional. Ember keeps Discipline on the table and passes this turn.",
    actor: "ember",
    pass: true,
  },
  {
    title: "Fern passes",
    text: "Fern passes too. Now you have your normal play plus Hurt Feelings: two plays this turn.",
    actor: "fern",
    pass: true,
  },
  {
    title: "Change the table",
    text: "Play Anger. Its effect lets you discard moods with a total value of 5 or less. Adding a second mood also turns Serenity to its 6-point side.",
    actor: "you",
    play: "anger",
  },
  {
    title: "Choose what Anger affects",
    text: "Tap Fern’s Apathy to select it, then confirm. Its value is 4, which fits Anger’s limit of 5. Your own moods can be targets too, so choose carefully in a real game.",
    actor: "you",
    choose: "apathy",
  },
  {
    title: "Use your extra play",
    text: "You still have one play from Hurt Feelings. Play Love for 4 points. With three moods, Serenity returns to 3, giving you 7 in total.",
    actor: "you",
    play: "love",
  },
  {
    title: "Your first round win",
    text: "End your turn. Your 7 beats Ember’s 6. You win this round and start the next; Fern gets Hurt Feelings. Tap any score to see its calculation.",
    actor: "you",
    pass: true,
  },
  {
    title: "Keep building your score",
    text: "Play Tranquility. Four moods makes Serenity worth 6 and Tranquility worth 3. Together with Love, that brings you to 13.",
    actor: "you",
    play: "tranquility",
  },
  {
    title: "Give the others their turns",
    text: "You’ve used your play. End your turn to see whether the bots can catch up.",
    actor: "you",
    pass: true,
  },
  {
    title: "Ember passes",
    text: "Ember leaves Discipline in play for 6 points.",
    actor: "ember",
    pass: true,
  },
  {
    title: "A second win",
    text: "Fern passes and scoring awards you a second round. First to three round wins takes the game.",
    actor: "fern",
    pass: true,
  },
  {
    title: "You can pass too",
    text: "Your 13 points are still on the table. Pass this turn and see if they hold up. In a real game, opponents can change your moods and your score!",
    actor: "you",
    pass: true,
  },
  {
    title: "Ember holds",
    text: "Ember passes with 6 points.",
    actor: "ember",
    pass: true,
  },
  {
    title: "One last count",
    text: "Fern passes. The game counts the final round.",
    actor: "fern",
    pass: true,
  },
  {
    title: "You’ve got a feel for it",
    text: "Three round wins! You played moods, resolved an effect, watched values change, and used Hurt Feelings. Real opponents will push back; card effects can override the usual rules. You’re ready for your own table.",
    button: "Find your next table",
  },
];
export function advanceLesson(g: Game, step: number): Game {
  const s = lesson[step];
  if (!s.actor) return g;
  if (s.play) {
    const card = g.cards.find(
      (c) => c.def === s.play && c.zone === "hand" && c.owner === s.actor,
    );
    if (!card || !g.grants[0])
      throw new Error("The practice play is unavailable.");
    return act(g, s.actor, {
      type: "play",
      card: card.uid,
      grant: g.grants[0].id,
    });
  }
  if (s.choose) {
    const card = g.cards.find((c) => c.def === s.choose && c.zone === "play");
    if (!card || !g.prompt)
      throw new Error("The practice choice is unavailable.");
    return act(g, s.actor, {
      type: "choose",
      prompt: g.prompt.id,
      selected: [card.uid],
    });
  }
  return act(g, s.actor, { type: "pass" });
}
