import test from "node:test";
import assert from "node:assert/strict";
import { parseWebVtt, notesFromCaptions, compileCall } from "./understand.js";
import { loadMatch } from "./match.js";

test("parseWebVtt reads start times and strips tags", () => {
  const cues = parseWebVtt(`WEBVTT

00:00:12.000 --> 00:00:15.000
Felix <c>scores</c>

00:01:02.500 --> 00:01:06.000
Haaland equalises
`);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].t, 12);
  assert.equal(cues[0].text, "Felix scores");
  assert.equal(cues[1].t, 62.5);
});

test("compileCall keeps picture order and drops lines that would talk over each other", () => {
  const cues = compileCall([
    { t: 40, label: "B", say: "Second picture.", caption: "b" },
    { t: 42, label: "C", say: "Too soon.", caption: "c" },
    { t: 5, label: "A", say: "First picture.", caption: "a" },
  ]);
  assert.deepEqual(cues.map((cue) => cue.label), ["A", "B"]);
  assert.ok(cues[0].at < cues[1].at);
  assert.match(cues[0].cue, /First picture/);
  assert.ok(cues.every((cue) => cue.cue.length <= 2000));
});

test("the Wembley reel is called in timestamp order from the frames", () => {
  const match = loadMatch();
  assert.equal(match.videoId, "oewyeR5F7TM");
  assert.ok(match.cues.length >= 8);
  for (let i = 1; i < match.cues.length; i += 1) {
    assert.ok(match.cues[i].at - match.cues[i - 1].at >= 14);
  }
  const spoken = match.cues.map((cue) => cue.cue).join("\n");
  const lead = spoken.indexOf("England two, Spain one");
  const level = spoken.indexOf("England two, Spain two");
  const winner = spoken.indexOf("England two, Spain three");
  assert.ok(lead > 0 && level > lead && winner > level);
  const scoreCues = match.cues.filter((cue) => cue.cut);
  assert.deepEqual(scoreCues.map((cue) => cue.label), ["England lead", "Level again", "Spain win it"]);
  assert.match(match.cues[0].cue, /Wembley/);
});
