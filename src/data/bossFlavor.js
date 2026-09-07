function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

const BOSS_FLAVOR = {
  varkyros: {
    sendOff: [
      (name) => `**${name}** steps into the ranks of the damned — Varkyros' legion parts just enough to let a challenger through.`,
      (name) => `Varkyros sees **${name}** approach and doesn't break formation. His legion never has to.`,
      (name) => `The endless ranks of the Underworld's army fall silent as **${name}** marches toward their general.`,
    ],
    win: [
      (name) => `**${name}** breaks Varkyros' line — for the first time in longer than he can remember, the General falls back.`,
      (name) => `Varkyros' discipline finally cracks under **${name}**'s assault. The legion holds; their general does not.`,
      (name) => `**${name}** puts Varkyros to the ground. Even in death, he looks more surprised than afraid.`,
    ],
    defeat: [
      (name) => `Varkyros has commanded armies far larger than one gladiator — **${name}** learns exactly why, the hard way.`,
      (name) => `**${name}** breaks against Varkyros' formation like every soul before them. The General doesn't even raise his voice.`,
      (name) => `One gladiator was never going to be enough. Varkyros puts **${name}** down without breaking stride.`,
    ],
    progress: [
      (name) => `**${name}** lands a real hit — Varkyros' bronze cracks, just slightly, for the first time in this fight.`,
      (name) => `A piece of the General's armor gives way under **${name}**'s blade. He barely seems to notice. Barely.`,
      (name) => `**${name}** forces Varkyros back a step. Small, but real — the legion notices even if he won't admit it.`,
    ],
  },
  cerberus: {
    sendOff: [
      (name) => `Three heads turn toward **${name}** at once. Cerberus doesn't growl a warning — there isn't one to give.`,
      (name) => `**${name}** crosses into Cerberus' territory. Somewhere in the dark, chains shift.`,
      (name) => `The Warden of the Dead rises to meet **${name}** — none of its three heads look away.`,
    ],
    win: [
      (name) => `**${name}** drives Cerberus back into the dark it guards. All three heads recoil at once.`,
      (name) => `Cerberus finally yields — **${name}** stands over the beast that has never once let anything past.`,
      (name) => `**${name}** silences all three heads in the same breath. The Warden falls.`,
    ],
    defeat: [
      (name) => `Three heads, three angles of attack — **${name}** never had a blind side left to use.`,
      (name) => `Cerberus doesn't tire the way a mortal does. **${name}** finds that out too late.`,
      (name) => `**${name}** goes down under fang and claw. Cerberus has never once let anything through, and tonight is no exception.`,
    ],
    progress: [
      (name) => `**${name}** draws blood from one of the three heads — the other two answer immediately.`,
      (name) => `A chain snaps loose under **${name}**'s assault. Cerberus barely seems to register the loss.`,
      (name) => `**${name}** forces Cerberus to actually favor a limb. Small mercy, but a real one.`,
    ],
  },
  acheron: {
    sendOff: [
      (name) => `**${name}** meets Acheron's gaze — the eyes of a king who has already died once, and clearly isn't afraid to again.`,
      (name) => `Acheron rises from his throne of bone to meet **${name}**, unhurried, as if he has all of death to spare.`,
      (name) => `**${name}** steps forward and Acheron simply waits — champions have come for him before, and left the same way they arrived: not at all.`,
    ],
    win: [
      (name) => `**${name}** does what armies of the living never managed — Acheron kneels, if only for a moment.`,
      (name) => `The Grave King's crown slips as Acheron falls before **${name}**. Even legends have a limit.`,
      (name) => `**${name}** ends what should have already ended once. Acheron goes down the way any king eventually does.`,
    ],
    defeat: [
      (name) => `Acheron has died before, and won every fight since. **${name}** just became the next name he doesn't remember.`,
      (name) => `**${name}** learns that "eternal champion" was never a boast — Acheron simply doesn't lose.`,
      (name) => `The Grave King doesn't gloat. He doesn't need to. **${name}** hits the ground and he's already turning away.`,
    ],
    progress: [
      (name) => `**${name}** cracks the ancient armor — Acheron glances down at the damage like it's the first he's seen in centuries.`,
      (name) => `A blow lands clean. Acheron actually staggers — **${name}** notices, and so does he.`,
      (name) => `**${name}** draws spectral blood. Acheron's expression doesn't change, but his footing does.`,
    ],
  },
  thanatos: {
    sendOff: [
      (name) => `**${name}** feels the temperature drop before Thanatos even appears. Death doesn't need to announce itself twice.`,
      (name) => `Thanatos regards **${name}** the way he regards everyone eventually — without malice, and without mercy either.`,
      (name) => `**${name}** stands before Hades' own executioner. Thanatos has never once needed to be told who's next.`,
    ],
    win: [
      (name) => `**${name}** does the impossible — Thanatos, judgment itself, finds himself judged.`,
      (name) => `Death's own hand falls still. **${name}** stands where Thanatos stood, and the Underworld notices the silence.`,
      (name) => `**${name}** puts down the one meant to put everyone else down. Even Hades will hear about this.`,
    ],
    defeat: [
      (name) => `Thanatos doesn't fight with anger. He doesn't need to. **${name}** learns that stillness can kill just as surely.`,
      (name) => `**${name}** never really stood a chance — Thanatos has delivered every final judgment that has ever come before this one.`,
      (name) => `There's no cruelty in how Thanatos ends it for **${name}**. Just certainty.`,
    ],
    progress: [
      (name) => `**${name}** actually forces Thanatos to react — a flicker of something almost like respect crosses the Vestments.`,
      (name) => `Death's shroud tears, just slightly. **${name}** presses the advantage while it lasts.`,
      (name) => `**${name}** lands a blow Thanatos clearly wasn't expecting to need to answer for.`,
    ],
  },
  hades: {
    sendOff: [
      (name) => `Hades doesn't wait to be found — he simply arrives, and **${name}** understands immediately why nothing before him mattered.`,
      (name) => `The God of the Underworld studies **${name}** with something closer to curiosity than judgment. That, somehow, is worse.`,
      (name) => `**${name}** stands before Hades himself. Every guardian, every trial, every fallen legion — it all led here.`,
    ],
    win: [
      (name) => `**${name}** forces Hades back a single step — and for the first time in an eternity, the Underworld itself seems to hold its breath.`,
      (name) => `Hades is subdued, not slain — no mortal blade reaches that far — but **${name}** has done what nothing living was ever supposed to do.`,
      (name) => `The God of the Underworld yields the ground beneath him. **${name}**'s name will echo through every domain that follows.`,
    ],
    defeat: [
      (name) => `Hades doesn't raise his scythe in anger — he simply ends it, the way gods end things that were never truly a threat.`,
      (name) => `**${name}** learns, as everyone eventually does, that fascination and mercy are not the same thing.`,
      (name) => `The Underworld reclaims **${name}** the way it reclaims everything, eventually. Hades barely has to try.`,
    ],
    progress: [
      (name) => `**${name}** actually draws Hades' full attention — the emerald flame around him flares, just once.`,
      (name) => `A crack spreads across the Sovereign's Dreadplate. Hades looks almost intrigued.`,
      (name) => `**${name}** lands a blow that would have ended anything mortal. Hades merely resets his footing.`,
    ],
  },
};

export function pickBossFlavor(bossId, messageType, name) {
  const pool = BOSS_FLAVOR[bossId]?.[messageType];
  if (!pool) return null; 
  return pick(pool)(name);
}
