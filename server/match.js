import { compileCall } from "./understand.js";

export const MATCH = {
  id: "nor-por-highlights",
  videoId: "ecxFwkUTpw4",
  duration: 312,
  competition: "UEFA Nations League",
  title: "Norway 1–2 Portugal",
  venue: "Ullevaal Stadion, Oslo",
  kickoff: "Highlight reel",
  filmed: "Called from the pictures. This cut has no caption track, so each line is timed to a frame: the team sheet, the walkout, then the bug at 0-0, 1-1 and 1-2.",
};

const FRAME_NOTES = [
  {
    t: 4,
    label: "Open",
    caption: "Night match at Ullevaal. The reel opens before the first picture of play.",
    say: "You're on Pitchside. This is Norway against Portugal in the Nations League, a highlight reel from Ullevaal, and the pictures are about to run.",
  },
  {
    t: 20,
    label: "Portugal XI",
    caption: "Portugal's team sheet is on screen, with the crest and the starting eleven.",
    say: "Portugal's team sheet fills the picture. Diogo Costa, Ruben Dias and Joao Felix are on that graphic. This is the eleven they have named.",
  },
  {
    t: 48,
    label: "Walkout",
    caption: "The referee in yellow walks out with the players.",
    say: "Out they come. The referee in yellow is on the grass with them, and the walk to the centre is already loud.",
  },
  {
    t: 78,
    label: "Anthems",
    caption: "Both teams stand in line for the anthems, the stands packed behind them.",
    say: "Anthems. The players are in line, shoulder to shoulder, and the near side of this stadium is a wall of colour.",
  },
  {
    t: 108,
    label: "Flag",
    caption: "A huge flag is held across the front of the stand.",
    say: "A flag is dragged across the front of the stand. Home support, full voice, and kickoff is still to come on this reel.",
  },
  {
    t: 136,
    label: "Home side",
    caption: "Norway's players posed in red, in front of their own goal.",
    say: "Norway for the photograph. Red shirts in front of their own goal, and the stand behind them is already up.",
  },
  {
    t: 160,
    label: "Kickoff",
    caption: "Open play. The scorebug reads Norway 0, Portugal 0.",
    say: "We're into the match. The bug reads Norway nil, Portugal nil. White shirts and red shirts, and nothing on the board yet.",
  },
  {
    t: 180,
    label: "Scramble",
    caption: "A scramble in the Norway goalmouth. The green keeper is down. The bug still says 0-0.",
    say: "A scramble in the goalmouth. The keeper in green is on the ground, a red shirt gets to the ball, and the bug has not moved. Still nil-nil on the screen.",
  },
  {
    t: 194,
    label: "One each",
    caption: "The scorebug has jumped to Norway 1, Portugal 1.",
    cut: true,
    say: "The bug has jumped. Norway one, Portugal one. Both sides are on the board. This reel has bolted from nil-nil to level.",
  },
  {
    t: 226,
    label: "Portugal lead",
    caption: "The scorebug reads Norway 1, Portugal 2.",
    cut: true,
    say: "Portugal in front. One-two. The white shirts have the second goal, and the score on the bug is Norway one, Portugal two.",
  },
  {
    t: 268,
    label: "One-two",
    caption: "Play continues with the bug still Norway 1, Portugal 2.",
    say: "Play goes on with Portugal leading. Red shirts and white shirts stretched across the pitch, and the bug is holding at one-two.",
  },
  {
    t: 300,
    label: "Close",
    caption: "Portugal players along the touchline. The reel ends at Norway 1, Portugal 2.",
    say: "That's the reel. Portugal's players along the touchline, Norway's end still full, and the score that stays up is one-two.",
  },
];

export function loadMatch() {
  const cues = compileCall(FRAME_NOTES);
  return {
    ...MATCH,
    cues,
  };
}
