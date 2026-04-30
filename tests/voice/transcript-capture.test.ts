import { describe, expect, it } from "vitest";
import { mergeVoiceTranscripts, prepareVoiceCapture, shouldCaptureVoiceTranscript } from "../../src/voice/transcript-capture.js";

describe("voice transcript capture", () => {
  it("skips short greetings and acknowledgements", () => {
    expect(shouldCaptureVoiceTranscript("Godmorgen.")).toBe(false);
    expect(shouldCaptureVoiceTranscript("Ja, ja, bitte.")).toBe(false);
    expect(shouldCaptureVoiceTranscript("Vielen Dank.")).toBe(false);
  });

  it("merges overlapping ASR fragments into the most complete transcript", () => {
    const first = "Also, da gibt's die Aufgabe Hochbeet ansehen.";
    const second = "Also, da gibt's die Aufgabe Hochbeet ansehen, es gibt die Aufgabe Rasen mähen.";

    expect(mergeVoiceTranscripts(first, second)).toBe(second);
  });

  it("extracts project and task candidates from German dictation", () => {
    const capture = prepareVoiceCapture(
      "Also, da gibt's die Aufgabe Hochbeet ansehen, es gibt die Aufgabe Rasen mähen, es gibt die Aufgabe Rasen vertikutieren und dann gibt es die Aufgabe Rasen düngen. Kannst du diese Aufgaben bitte für mich im Projekt Gartenarbeit anlegen?"
    );

    expect(capture?.thoughts).toEqual([
      expect.objectContaining({ type: "possible_project", content: "Gartenarbeit" }),
      expect.objectContaining({ type: "possible_task", content: "Hochbeet ansehen" }),
      expect.objectContaining({ type: "possible_task", content: "Rasen mähen" }),
      expect.objectContaining({ type: "possible_task", content: "Rasen vertikutieren" }),
      expect.objectContaining({ type: "possible_task", content: "Rasen düngen" })
    ]);
  });

  it("extracts multiple project candidates from long voice-message dictation", () => {
    const capture = prepareVoiceCapture(
      "ich möchte gerne Gedanken sortieren und zwar das Projekt einwöchige Fahrradtour im Juni das möchte ich anlegen dann gibt es das Projekt Tourenrad kaufen und dann gibt es das Projekt Neuseeland Radreise Januar bis März 2027 genau das reicht erstmal"
    );

    expect(capture?.thoughts).toEqual([
      expect.objectContaining({ type: "possible_project", content: "einwöchige Fahrradtour im Juni" }),
      expect.objectContaining({ type: "possible_project", content: "Tourenrad kaufen" }),
      expect.objectContaining({ type: "possible_project", content: "Neuseeland Radreise Januar bis März 2027" })
    ]);
  });
});
