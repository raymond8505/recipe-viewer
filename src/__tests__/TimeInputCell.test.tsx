import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TimeInputCell from "@/components/TimeInputCell";

/** Controlled harness — the cell holds no state of its own, so a test that
 *  wants to see the blur rewrite has to own the value the way the draft does. */
function Harness({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return <TimeInputCell label="Prep time" value={value} onChange={setValue} />;
}

describe("TimeInputCell", () => {
  it("re-spells a bare minute count as H:MM on blur", async () => {
    render(<Harness initial="" />);
    const input = screen.getByLabelText("Prep time") as HTMLInputElement;

    await userEvent.type(input, "45");
    // Still exactly what was typed while the field has focus — reformatting
    // mid-keystroke would fight the typist.
    expect(input.value).toBe("45");

    await userEvent.tab();
    expect(input.value).toBe("0:45");
  });

  it("re-spells a unit-tagged entry on blur", async () => {
    render(<Harness initial="" />);
    const input = screen.getByLabelText("Prep time");
    await userEvent.type(input, "1h30m");
    await userEvent.tab();
    expect((input as HTMLInputElement).value).toBe("1:30");
  });

  it("carries minutes past 59 into hours on blur", async () => {
    render(<Harness initial="" />);
    const input = screen.getByLabelText("Prep time");
    await userEvent.type(input, "1:75");
    await userEvent.tab();
    expect((input as HTMLInputElement).value).toBe("2:15");
  });

  it("leaves an unparseable entry exactly as typed", async () => {
    render(<Harness initial="" />);
    const input = screen.getByLabelText("Prep time");
    await userEvent.type(input, "a while");
    await userEvent.tab();
    // The typo stays on screen to be fixed. Rewriting or blanking it would
    // hide the fact that this field is about to save nothing.
    expect((input as HTMLInputElement).value).toBe("a while");
  });

  it("blanks a zero entry, which is how a time is cleared", async () => {
    render(<Harness initial="1:30" />);
    const input = screen.getByLabelText("Prep time");
    await userEvent.clear(input);
    await userEvent.type(input, "0:00");
    await userEvent.tab();
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("does not fire onChange on blur when the value is already canonical", async () => {
    const onChange = vi.fn();
    render(<TimeInputCell label="Prep time" value="1:30" onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("Prep time"));
    await userEvent.tab();
    expect(onChange).not.toHaveBeenCalled();
  });
});
