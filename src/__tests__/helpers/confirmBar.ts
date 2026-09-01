import { act, fireEvent, screen } from "@testing-library/react";

/**
 * Drive a `ConfirmBar`-gated action to completion: one click raises the bar,
 * a second accepts it.
 *
 * The single argument works because the gated triggers reuse their own label on
 * the confirm button — the trigger and the bar are never on screen together, so
 * there is no ambiguity for `getByRole` to trip over. Pass `confirmName` only
 * where a call site deliberately breaks that convention.
 *
 * Both clicks are wrapped in `act` rather than left to `fireEvent` alone: the
 * confirm swaps the surrounding row, and an unwrapped state update logs a React
 * warning — which this branch treats as a test failure.
 */
export async function clickAndConfirm(
  name: RegExp | string,
  confirmName: RegExp | string = name,
) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: confirmName }));
  });
}
