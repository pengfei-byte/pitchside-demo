import { compileCall } from "./understand.js";

export const MATCH = {
  id: "eng-esp-highlights",
  videoId: "oewyeR5F7TM",
  duration: 199,
  competition: "UEFA Nations League",
  title: "England 2–3 Spain",
  venue: "Wembley Stadium, London",
  kickoff: "Highlight reel",
  filmed: "Called from the pictures. This cut has no caption track, so each line is timed to a frame: the Wembley title, then the bug at 1-1, 2-1, 2-2 and 2-3.",
};

const FRAME_NOTES = [
  {
    t: 6,
    label: "Title",
    caption: "Title card: England versus Spain at Wembley, Nations League.",
    say: "You're on Pitchside. This is England against Spain, Nations League night at Wembley, and the highlight reel is about to run.",
  },
  {
    t: 24,
    label: "Level",
    caption: "Open play. The scorebug reads England 1, Spain 1. England in white, Spain in red.",
    say: "We're into the match. The bug reads England one, Spain one. White shirts and red shirts, and this reel has joined it already level.",
  },
  {
    t: 52,
    label: "Still level",
    caption: "Play continues with the bug still England 1, Spain 1.",
    say: "Still one apiece. England in white working it across this pitch, Spain in red holding their shape, and the bug has not moved.",
  },
  {
    t: 86,
    label: "England lead",
    caption: "The scorebug reads England 2, Spain 1. A white number 9 and Gordon, number 11, are in the pictures.",
    cut: true,
    say: "England in front. Two-one. The white number nine is through the picture, Gordon in eleven is in the celebration, and the bug says England two, Spain one.",
  },
  {
    t: 112,
    label: "Spain attack",
    caption: "Spain in red attack the England goal. The bug still reads England 2, Spain 1.",
    say: "Spain come back at them. Red shirts into the England box, a shot at the near side, and the bug is still holding at two-one.",
  },
  {
    t: 132,
    label: "Level again",
    caption: "The scorebug reads England 2, Spain 2. Spain shirts celebrate.",
    cut: true,
    say: "Level again. England two, Spain two. The red shirts are celebrating, and Wembley has been pulled back to all square.",
  },
  {
    t: 156,
    label: "Spain win it",
    caption: "The scorebug reads England 2, Spain 3. A red number 15 with Alex on the shirt is in shot.",
    cut: true,
    say: "Spain have it. Two-three. The red number fifteen, Alex on the back, is in the picture, and the bug says England two, Spain three.",
  },
  {
    t: 184,
    label: "Close",
    caption: "The reel ends on the England end card. The score that stayed up was England 2, Spain 3.",
    say: "That's the reel. England at home, Spain the ones who left with it, and the score that stays on this film is two-three.",
  },
];

export function loadMatch() {
  const cues = compileCall(FRAME_NOTES);
  return {
    ...MATCH,
    cues,
  };
}
