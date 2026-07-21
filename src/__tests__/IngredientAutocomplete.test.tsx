import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import IngredientAutocomplete from "@/components/ingredients/IngredientAutocomplete";
import type { IngredientKeywordMatch } from "@/types/ingredient";

function makeMatch(id: string, name: string, overrides?: Partial<IngredientKeywordMatch>) {
  return {
    id,
    name,
    aliases: [],
    nutrition: null,
    density_g_per_ml: null,
    similarity: 0.9,
    ...overrides,
  };
}

// Injected search seam — no fetch, no api-module mock needed.
const search = vi.fn<(q: string) => Promise<IngredientKeywordMatch[]>>();
const onSelect = vi.fn();

function renderClosed(value: { id: string; name: string } | null = null) {
  return render(
    <IngredientAutocomplete
      value={value}
      onSelect={onSelect}
      ariaLabel="Change match for 1 tsp cumin"
      search={search}
    />,
  );
}

async function openAndType(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.click(screen.getByLabelText("Change match for 1 tsp cumin"));
  const input = screen.getByRole("combobox");
  await user.clear(input);
  await user.type(input, text);
  return input;
}

beforeEach(() => {
  vi.clearAllMocks();
  search.mockResolvedValue([]);
});

describe("IngredientAutocomplete", () => {
  it("renders the current match name closed, and 'unmatched' when there is none", () => {
    const { unmount } = renderClosed({ id: "ing-1", name: "cumin seed" });
    expect(screen.getByText("cumin seed")).toBeInTheDocument();
    unmount();

    renderClosed(null);
    expect(screen.getByText("unmatched")).toBeInTheDocument();
  });

  it("debounces typing into one search and lists the results", async () => {
    const user = userEvent.setup();
    search.mockResolvedValue([
      makeMatch("ing-1", "yellow onion"),
      makeMatch("ing-2", "red onion", { similarity: 0.72 }),
    ]);
    renderClosed();

    await openAndType(user, "onion");

    const options = await screen.findAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      "yellow onion90%",
      "red onion72%",
    ]);
    // Every keystroke restarted the debounce — only the settled query hit the seam.
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith("onion");
  });

  it("does not search below two characters", async () => {
    const user = userEvent.setup();
    renderClosed();

    await openAndType(user, "o");

    expect(await screen.findByText("Type to search…")).toBeInTheDocument();
    expect(search).not.toHaveBeenCalled();
  });

  it("selects with Enter after arrow-key navigation (wrapping)", async () => {
    const user = userEvent.setup();
    const matches = [makeMatch("ing-1", "yellow onion"), makeMatch("ing-2", "red onion")];
    search.mockResolvedValue(matches);
    renderClosed();

    const input = await openAndType(user, "onion");
    await screen.findAllByRole("option");

    // Down, down, down wraps back to the first option.
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(input).toHaveAttribute(
      "aria-activedescendant",
      expect.stringMatching(/-opt-1$/),
    );
    await user.keyboard("{ArrowUp}");
    await user.keyboard("{Enter}");

    expect(onSelect).toHaveBeenCalledWith(matches[0]);
    // Editor closed back to the trigger button.
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("closes on Escape without selecting", async () => {
    const user = userEvent.setup();
    search.mockResolvedValue([makeMatch("ing-1", "yellow onion")]);
    renderClosed({ id: "ing-0", name: "shallot" });

    await openAndType(user, "onion");
    await screen.findAllByRole("option");
    await user.keyboard("{Escape}");

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("offers 'Clear match' when a value is set and reports null on click", async () => {
    const user = userEvent.setup();
    search.mockResolvedValue([]);
    renderClosed({ id: "ing-0", name: "shallot" });

    await openAndType(user, "onion");
    const clear = await screen.findByRole("option", { name: "Clear match" });
    await user.click(clear);

    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("drops a stale response that resolves after a newer query's", async () => {
    const user = userEvent.setup();
    let resolveFirst!: (m: IngredientKeywordMatch[]) => void;
    search
      .mockImplementationOnce(
        () => new Promise<IngredientKeywordMatch[]>((r) => (resolveFirst = r)),
      )
      .mockResolvedValueOnce([makeMatch("ing-2", "red onion")]);
    renderClosed();

    await openAndType(user, "on");
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1));

    await user.type(screen.getByRole("combobox"), "ion");
    await waitFor(() => expect(search).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("option", { name: /red onion/ })).toBeInTheDocument();

    // The first (stale) response lands late — it must not clobber the newer one.
    resolveFirst([makeMatch("ing-1", "yellow onion")]);
    await waitFor(() =>
      expect(screen.queryByRole("option", { name: /yellow onion/ })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("option", { name: /red onion/ })).toBeInTheDocument();
  });

  it("reports open/close through onOpenChange so the host cell can restack", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <IngredientAutocomplete
        value={null}
        onSelect={onSelect}
        ariaLabel="Change match for 1 tsp cumin"
        search={search}
        onOpenChange={onOpenChange}
      />,
    );

    await user.click(screen.getByLabelText("Change match for 1 tsp cumin"));
    expect(onOpenChange).toHaveBeenLastCalledWith(true);

    // Focus moves to the input on a rAF after the click, so target it
    // directly rather than relying on document focus.
    await user.type(screen.getByRole("combobox"), "{Escape}");
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("shows 'Search unavailable' on a failed search, never 'No matches'", async () => {
    const user = userEvent.setup();
    search.mockRejectedValue(new Error("500"));
    renderClosed();

    await openAndType(user, "onion");

    expect(await screen.findByText("Search unavailable")).toBeInTheDocument();
    expect(screen.queryByText("No matches")).not.toBeInTheDocument();
  });
});
