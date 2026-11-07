# College of Keys: Personas

Personas for College of Keys, the D&D bard piano app. Use this document to make product choices and to write stories that serve real users. When a feature decision is unclear, ask which persona it serves and how. If it serves none of them, it probably does not belong in the app.

This document is written to live in the repo as `PERSONAS.md`, alongside the other project docs, so the people and agents building the app read it as part of the source of truth.

## Rules that apply to every persona

These rules came out of the persona interviews. They hold across the whole set.

- **They all love D&D.** Every persona here is a D&D person. That is the shared ground, not a niche extra.

- **The flavor is the app.** The D&D flavor is not a skin on top of a piano app. The flavor, the dice, and the visuals are the app itself. If they were missing, it would feel wrong. Any feature that cannot wear the bard skin does not belong.

- **Bard is the only class that matters.** College of Keys is a bard app. Frame progress, titles, and rewards in bard terms.

- **They pick their own songs.** Forced catalogs and classics-only lessons are the reason these users quit other apps. Song choice is a core need, not a nice extra.

- **Difficulty is chosen, not assigned.** Players pick a harder version of a song themselves when they are ready. Do not auto-promote them.

- **Fun comes before rigor.** These users return for progress they can feel, songs they love, and play with other people. Dry instruction loses them, even when it teaches them something real.

## The personas at a glance

| Persona | Priority | One-line summary |
|---|---|---|
| The Returning Adult | Main | Busy adult beginner who needs real songs and game progress to keep coming back |
| The Gamer Bard | Main | Here for the RPG layer first, with the keyboard as the controller |
| The Rock Band Player | Main | Rhythm game veteran who judges game feel, polish, and scoring first |
| The Casual Song Player | Close second | Just wants to play favorite songs, with the least friction possible |
| The Young Learner | Tentative | Musical teenager, new to piano, who already games and plays D&D |
| The Conservatory Purist | Anti-persona | Wants strict pedagogy only, and is not who this app is for |

## Main persona: The Returning Adult

This persona is Kiyoshi himself: 37, busy, learning piano as an adult with a 61-key foldable piano, an iPad, and a PC. He is the primary user today, and the app has to work for him first.

### What his last practice looked like

His last session was on Flowkey on the iPad. He hit the subscribe paywall after about 20 minutes, moved to another app, and walked through basic lessons there. Both apps taught him something real: he learned some basic keys and note reading, and he liked that. He still quit both.

### Why he quit

- They were dry.
- He could not pick his own songs.
- The classics are boring to him.
- Nothing kept him engaged or gave him a reason to return.

### What keeps him coming back

- Gamified progress like Duolingo: visible progress, levels, and a reason to open the app again tomorrow.
- Real songs he already loves, not exercises dressed up as songs.
- Short practice bursts that fit a busy life, not long formal lessons.

### His music

- Pop: Chappell Roan, Sabrina Carpenter, John Legend, Sam Smith, Teddy Swims, Bruno Mars.
- Pop punk: Paramore, Linkin Park, Sleep Token, blink-182, Weezer.
- Musicals: Hamilton, Mean Girls, Heathers, Dead Mom from Beetlejuice, Dear Evan Hansen.

If a song is not in these worlds, it is probably not a starter song for him.

### The difficulty ladder he needs

He does not just want easy versions. He wants a ladder for each song:

1. Start with a simplified version he can actually play.
2. Layer on difficulty and more notes as he improves.
3. End up playing the real thing.

YouTube has easy tutorials, but the path from easy to real is unclear. College of Keys should make that path visible for a single song, and he picks when to climb it himself.

### His starting point, stated plainly

Every song starts from scratch for him right now, because he plays by following the highway. He can barely find the keys today. That is exactly why reading music matters as a long-term skill: it is the one skill that transfers, so the next song is not a fresh climb. The sheet music view and notation work serve this persona directly.

### Design checks for this persona

- Can he start a song he loves within a minute of opening the app?
- Can he see the next harder version of that same song, and choose it himself?
- Does a short session still move his level, XP, or quest progress?
- Is anything in the flow dry, locked behind a paywall-style wall, or classics-only? If so, it fails him.

## Main persona: The Gamer Bard

The Gamer Bard is here for the RPG layer first and the piano second. XP, levels, quests, titles, and the tavern are the motivation. The keyboard is the controller.

### What he cares about

- A character who grows: level, title, and XP that reflect real practice.
- Quests and goals that give a session a purpose beyond playing a song once.
- Dice moments and bard flavor in the feedback itself, such as a performance check at the end of a song.
- A world that feels consistent: the tavern, the Grimoire, and the Quest Board as places, not menu labels.

### What loses him

- A plain piano tutor with a few badges pasted on. He can tell the difference, and it feels wrong to him.
- Rewards that have nothing to do with playing. Progress should come from songs played, not from clicking around.
- Flavor that stops at the menu. If the practice screen itself drops the bard framing, the spell breaks.

### Design checks for this persona

- Does finishing a song feel like finishing a performance, with a result he cares about?
- Does his bard visibly grow over weeks, not just over one session?
- Is every new system named, shown, and rewarded in bard terms?

## Main persona: The Rock Band Player

The Rock Band Player already speaks rhythm games fluently. He has played Guitar Hero, Rock Band, and DJ Hero, still plays Rock Band now, and also plays Just Dance and Rhythm Heaven. He modded a Wii to play the dance games there. He will judge College of Keys as a game first and as a learning tool second, which makes him the quality bar for game feel: if it feels good to him, it feels good to everyone.

### What makes a rhythm game feel good to him

- Visual polish. Weak graphics made some games feel cheap to him, and cheap reads as low quality before he has played a note.
- Clear timing, scoring, and grades he can chase.
- Difficulty tiers he understands and can choose between.
- A setlist of songs he actually wants to play.

### The people behind this persona

Kiyoshi's friends are this persona in real life. They already play instruments, mostly guitar, while he is the one non-musician in the group. They love Rock Band, play on Expert, and lean toward metal, while he plays the pop punk songs. One friend has just started piano, so there is also a peer learner in the group. These are the friends Kiyoshi wants to try the app someday, so this persona has to respect real musicians without punishing beginners.

### What Lips taught him about singing games

His favorite singing game was Lips on Xbox, and there is nothing quite like it now. What made it work was head-to-head play with his wife Amber, plain fun, mics that doubled as instruments when you shook them, and a fantastic song list where they always had something they wanted to sing. Competition and a great song list beat technical depth. That lesson applies to any future vocals or multiplayer work: play together, keep it joyful, and stock songs people love.

### Design checks for this persona

- Does the timing feel fair, and does the scoring tell him how to get better?
- Does the app look polished enough that he trusts it in the first ten seconds?
- Can an Expert-level player find a tier that challenges him, while a beginner in the same app is not crushed?
- Could he hand this to a friend who plays real guitar and not be embarrassed by the game feel?

## Close second: The Casual Song Player

The Casual Song Player just wants to play favorite songs, often sourced from YouTube. He does not care about theory, levels, or reading music, and he will not do homework to get to a song.

### What he cares about

- The shortest path from hearing a song to playing a version of it.
- Songs he chose, in the genres he already listens to.
- A result that sounds like the song, even in a simplified form.

### What loses him

- Lessons, theory gates, or level requirements standing between him and a song.
- Setup friction. Every extra step before the first note costs users.

### Design checks for this persona

- Can he go from a YouTube link to playing in a few steps, with no lesson in between?
- Does the app stay out of his way if he ignores XP, quests, and notation entirely?

This persona is a close second, not a main, so his needs shape the entry path but do not override the mains. If a choice helps him by stripping out the RPG layer, it is the wrong choice.

## Tentative persona: The Young Learner

The Young Learners are Kiyoshi's teenagers, who may try the app someday. They are not blank-slate beginners, and they should not be designed for as if they were young children.

### Who they are

- They do not play piano. Piano would be a new instrument for them.
- They are already musical: both are in chorus and do theater, and one used to play percussion.
- They like games and they play D&D with their dad.

### What that means for design

- Musical basics are not foreign to them. Rhythm, singing, and performing on stage are familiar ground.
- The game layer and the D&D flavor are the invitation, the same as for the other personas.
- Readability, clear difficulty steps, and short sessions matter, but nothing should be dumbed down or made childish for them.

### Design checks for this persona

- Could a musical teenager start a first song without a parent walking them through setup?
- Does the app respect that they are performers already, just new to this instrument?

This persona is tentative. Keep it in mind for difficulty and readability, but do not let it pull scope ahead of the three mains.

## Anti-persona: The Conservatory Purist

The Conservatory Purist wants strict pedagogy and standard notation only, in a set order, with no game layer. College of Keys is not built for him.

Naming him matters because it tells builders what not to build: no mandatory lesson tracks before songs, no notation-only mode as the price of entry, and no stripping the bard flavor to look more serious. Notation is in the app because it helps the Returning Adult stop starting every song from scratch, not because the Purist demands it.

## How to use these personas in a story

Before a story is accepted, it should name the persona or personas it serves and pass their design checks. A few standing rules for story writing:

- A story that serves no named persona gets questioned before it gets built.
- A story that helps one persona by breaking a shared rule, such as removing song choice or auto-raising difficulty, needs an explicit decision, not a quiet trade.
- The three mains outrank the close second, and the close second outranks the tentative persona, when needs conflict.
- New interview detail beats this document. When a real user says something that changes a persona, update this file in the same pass as the work it affects.
