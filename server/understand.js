const STAMP = /(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})/;

function toSeconds(hours, minutes, seconds, millis) {
  return Number(hours || 0) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(millis) / 1000;
}

export function parseWebVtt(vtt) {
  const lines = String(vtt || "").replace(/\r/g, "").split("\n");
  const cues = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(new RegExp(`${STAMP.source}\\s+-->\\s+${STAMP.source}`));
    if (!match) continue;
    const start = toSeconds(match[1], match[2], match[3], match[4]);
    const text = [];
    i += 1;
    while (i < lines.length && lines[i].trim()) {
      text.push(lines[i].replace(/<[^>]+>/g, "").trim());
      i += 1;
    }
    const body = text.join(" ").replace(/\s+/g, " ").trim();
    if (body) cues.push({ t: Math.round(start * 10) / 10, text: body });
  }
  return cues;
}

export function notesFromCaptions(cues, everySec = 18) {
  const notes = [];
  let last = -999;
  for (const cue of cues || []) {
    if (!cue?.text || !Number.isFinite(cue.t)) continue;
    if (cue.t - last < everySec) continue;
    last = cue.t;
    notes.push({
      t: cue.t,
      label: "Caption",
      caption: cue.text,
      say: cue.text,
    });
  }
  return notes;
}

function director(words) {
  return `[DIRECTOR — silent]
Say these words in order, as a live football commentator. Present tense. Do not add a different incident, score, or name. Do not ask a question.

${words}`.trim();
}

export function compileCall(notes, { minGap = 14 } = {}) {
  const sorted = [...(notes || [])]
    .filter((note) => note && Number.isFinite(Number(note.t)) && String(note.say || "").trim())
    .sort((a, b) => Number(a.t) - Number(b.t));
  const cues = [];
  let last = -999;
  for (const note of sorted) {
    const at = Number(note.t);
    if (cues.length && at - last < minGap) continue;
    last = at;
    cues.push({
      id: `call_${cues.length + 1}`,
      at,
      label: note.label || "Live",
      caption: note.caption || note.say,
      cut: Boolean(note.cut),
      words: String(note.say).trim().length,
      cue: director(String(note.say).trim()).slice(0, 2000),
    });
  }
  return cues;
}
