# The fly brain bot

The **Fly brain** bot is a Mood Swings player whose decisions run through a
piece of a real fruit fly nervous system: the mushroom body of the MaleCNS v1.0
connectome released on 3 September 2026 by HHMI Janelia Research Campus and
Google Research. This document explains what is real, what is ours, how it was
taught, and how to reproduce it.

## What the data is

MaleCNS v1.0 is the first complete wiring diagram of an adult male fruit fly's
brain and ventral nerve cord: about 166,700 neurons and millions of synapses,
reconstructed from electron microscopy and released under CC-BY 4.0. The flat
connectome files live in the public bucket
`https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome/`.
The same data is browsable in [FlyWire Codex](https://codex.flywire.ai/) as
"MCNS v1.0" and on the [MaleCNS site](https://male-cns.janelia.org/).

The circuit file `data/fly/circuit.json` records the three source files, their
SHA-256 checksums, and the counts below. It is produced by
`scripts/fly/extract_circuit.py`.

| Layer                                | Right hemisphere | Role in the bot                                    |
| ------------------------------------ | ---------------: | -------------------------------------------------- |
| Projection neurons onto Kenyon cells |              310 | Receive the game state and one candidate action    |
| Kenyon cells                         |            2,045 | Sparse expansion: about 6 inputs each, 5% active   |
| Mushroom body output neurons (MBONs) |               45 | Approach or avoid; sign from neurotransmitter data |
| Projection → Kenyon cell synapses    |           12,167 | Fixed wiring, synapse counts from the connectome   |
| Kenyon cell → MBON synapses          |           24,091 | The only plastic synapses, trained by reward       |
| Dopaminergic neurons                 |              170 | Counted for reference; the reward signal in vivo   |

The mushroom body is the fly's associative learning center. In a living fly,
odors activate a sparse set of Kenyon cells, and dopamine neurons carrying
reward or punishment change the strength of the active Kenyon cell → MBON
synapses. The MBONs then bias the fly toward approaching or avoiding that odor.
The bot uses the same architecture with the same wiring.

## What is real and what is ours

Real, from the connectome:

- Which projection neurons connect to which Kenyon cells, and with how many synapses.
- Which Kenyon cells connect to which MBONs, and with how many synapses.
- The excitatory or inhibitory sign of every neuron, from the released consensus
  neurotransmitter predictions (acetylcholine, dopamine, serotonin, and
  octopamine positive; GABA, glutamate, and histamine negative).

Ours, because a connectome does not contain them:

- **What the fly smells.** A connectome has no game in it. The encoder in
  `src/game/fly.ts` turns the ordinary player view plus one candidate action
  into 277 numbers in the range zero to one: scores, hand and deck counts,
  colors on the table, the candidate card's identity, color, printed values,
  rarity and ability types, the summary of a decision's selected cards, and
  thermometer-coded intensities (several neurons that switch on progressively,
  the way odor concentration spreads across glomeruli). Each number drives one
  excitatory projection neuron, in order of how strongly that neuron drives
  Kenyon cells in the connectome. The 30 inhibitory projection neurons receive
  no game input. Two of those numbers are the existing Normal bot's card and
  decision heuristics, so the fly starts with the same nose the Normal bot has.
- **Synaptic strength.** The connectome counts synapses but does not measure how
  strong they are. Projection → Kenyon cell inputs are normalized per Kenyon cell.
- **Sparsity.** The APL neuron's global feedback inhibition is modeled as
  winner-take-all: only the top 5% of Kenyon cells stay active, with activity
  measured above the inhibition threshold and normalized to sum to one.
- **Readout.** Each MBON's output is its sign times the sum of its active Kenyon
  cell inputs, weighted by the trained synapses. The candidate with the highest
  total is played. Ties are broken by the same seeded noise the other bots use.

The bot is deterministic for a given view and seed, sees only the player view
(never hidden hands, deck order, or the server's random generator), and its
every action still goes through the rules engine. One safeguard sits outside
the circuit: some rules-legal cycles never end (Anger discarding Grief and
Duplicity, Grief replaying them from the discard pile, Duplicity doubling the
permission), and a deterministic player would walk that loop forever, so the
fly passes once it has played twelve moods in a turn.

## How it was taught

`scripts/fly/train.ts` adjusts only the Kenyon cell → MBON synapses, projected
to stay non-negative: a synapse can be depressed to silence, never flip sign.

1. **Imitation.** The Hard bot plays hundreds of games at two to four seats. For
   every decision, the synapses active for the candidate Hard chose are
   strengthened and those for the other candidates weakened (softmax
   cross-entropy). This is the "teacher" phase.
2. **Reinforcement.** The fly plays whole games against Easy, Normal, and Hard
   bots, sampling actions from its own preferences. A won game, and a won
   round, act as the dopamine signal: synapses behind the decisions of a winning
   game are strengthened, those behind a losing game weakened (REINFORCE with a
   running baseline and Adam).
3. **Selection and evaluation.** After imitation and every 250 reinforcement
   games, the synapses are scored on a fixed checkpoint set of 100 games against
   Hard, and the best snapshot is kept. That snapshot then plays deterministic
   games against fixed line-ups on a separate seed set; the results are stored in
   `data/fly/weights.json` under `meta`.

Baselines measured with `scripts/fly/baselines.ts` (200 two-player games each,
seats alternating): Easy wins 9% against Hard, Normal 27%, and Hard 50% against
itself allowing for first-seat advantage.

| Line-up (fly seat rotates)         | Fly win rate |
| ---------------------------------- | -----------: |
| 2 players vs Hard                  |          31% |
| 2 players vs Normal                |          54% |
| 3 players vs Hard and Normal       |          26% |
| 4 players vs Hard, Normal and Easy |          25% |

Read these as "a real circuit with a linear readout on a sparse code" rather
than as a strong AI: the fly plays a little above the Normal bot (it beats
Normal 54% of the time and Easy about 75%, and takes 31% of games from Hard
where Normal takes 27%). It is included because it is fun and genuinely runs a
fly circuit, not because it is the strongest opponent.

## Reproduce

Extract the circuit (downloads about 560 MB into `.runtime/malecns/`):

```sh
python3 -m venv .venv
.venv/bin/pip install -r scripts/fly/requirements.txt
.venv/bin/python scripts/fly/extract_circuit.py
```

Train and evaluate (a few minutes on a laptop, pure TypeScript):

```sh
npx tsx scripts/fly/train.ts --imitate 400 --epochs 4 --reinforce 2000 --eval 300
```

The command overwrites `data/fly/weights.json`. Run `npm test` afterwards; the
fly suite checks the circuit's integrity, feature-to-neuron assignment, code
sparsity, legality of decisions, and that the trained fly beats the Easy bot.

## Sources

- Google Research, [The first complete map of a male fruit fly's brain and nervous system](https://blog.google/innovation-and-ai/technology/research/male-fruit-fly-brain-map/), 3 September 2026.
- HHMI Janelia, [MaleCNS project site](https://male-cns.janelia.org/) and public bucket `flyem-male-cns`.
- FlyWire, [Codex connectome explorer](https://codex.flywire.ai/).
- Community experiments that inspired this bot, collected in [awesome-fly](https://github.com/cobanov/awesome-fly): [nfly](https://github.com/zhengxuyu/nfly) (the connectome as a recurrent network for Gymnasium games), [FlyPong](https://github.com/jonatasperaza/FlyPong), [FLYT3](https://github.com/seanphan/flyt3) (tic-tac-toe with a REINFORCE-trained readout), and the Doom and Super Mario 64 demos covered by [Gizmodo](https://gizmodo.com/google-mapped-a-fruit-flys-brain-now-its-playing-doom-and-super-mario-64-2000808616) and [Tom's Hardware](https://www.tomshardware.com/software/programming/google-maps-entire-brain-and-central-nervous-system-of-adult-male-fruit-fly-software-engineers-immediately-make-it-run-doom-ai-powered-3d-model-of-over-166-000-neurons-can-also-play-super-mario-64).

As those write-ups note, in every one of these demos, including this one, the
connectome supplies wiring and a separately trained readout supplies the
behavior. The fly is not thinking about Mood Swings; its mushroom body is being
used as a fixed, biologically wired feature expansion with plastic output
synapses, which is also a fair description of how it learns odors.
