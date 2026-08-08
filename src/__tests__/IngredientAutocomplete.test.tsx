import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import IngredientAutocomplete from "@/components/ingredients/IngredientAutocomplete";
import type { IngredientKeywordMatch } from "@/types/ingredient";
import type { UsdaSearchFood } from "@/lib/usda";

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

  it("focuses and selects the pre-filled name on open, so one keystroke replaces it", async () => {
    const user = userEvent.setup();
    renderClosed({ id: "ing-0", name: "shallot" });

    await user.click(screen.getByLabelText("Change match for 1 tsp cumin"));
    const input = screen.getByRole("combobox");
    const { selectionStart, selectionEnd } = input as HTMLInputElement;

    expect(input).toHaveFocus();
    expect([selectionStart, selectionEnd]).toEqual([0, "shallot".length]);

    // The selection is the point. Typed via keyboard, not `type()`: the real
    // user's click landed on the trigger, so nothing re-clicks the input and
    // collapses the selection — the next keystroke replaces the whole name.
    await user.keyboard("onion");
    expect(input).toHaveValue("onion");
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

  it("does not lose the first keystroke when a deferred focus lands mid-typing", async () => {
    // Regression for a CI-load flake: focus/select of the freshly-mounted
    // input must happen in the same commit that mounts it. When it was
    // deferred through requestAnimationFrame (a ~16ms wall-clock timer in
    // jsdom), a loaded runner could process the first keystroke before the
    // callback ran — select() then highlighted that character and the next
    // keystroke replaced it ("gochujang" → "ochujang"). Queue rAF callbacks
    // and flush them between keystrokes to force that ordering
    // deterministically; the component must not care.
    const queued: FrameRequestCallback[] = [];
    const raf = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb) => {
        queued.push(cb);
        return queued.length;
      });

    const user = userEvent.setup();
    renderClosed();
    await user.click(screen.getByLabelText("Change match for 1 tsp cumin"));
    const input = screen.getByRole("combobox");
    await user.type(input, "g");
    queued.splice(0).forEach((cb) => cb(0));
    // keyboard(), not type(): type() would click first, collapsing the
    // selection — mid-word keystrokes in the real flake have no such click.
    await user.keyboard("ochujang");

    raf.mockRestore();
    expect(input).toHaveValue("gochujang");
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

describe("IngredientAutocomplete — USDA fallback", () => {
  const usdaSearch = vi.fn<(q: string) => Promise<UsdaSearchFood[]>>();
  const onImportUsda = vi.fn();
  const gochujang: UsdaSearchFood = {
    fdcId: 123,
    description: "GOCHUJANG PASTE",
    dataType: "Branded",
    score: 500,
  };

  function renderWithUsda() {
    return render(
      <IngredientAutocomplete
        value={null}
        onSelect={onSelect}
        ariaLabel="Change match for 1 tbsp gochujang"
        search={search}
        usdaSearch={usdaSearch}
        onImportUsda={onImportUsda}
      />,
    );
  }

  async function openTypeAndSearchUsda(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByLabelText("Change match for 1 tbsp gochujang"));
    await user.type(screen.getByRole("combobox"), "gochujang");
    await user.click(
      await screen.findByRole("option", { name: /Search USDA for/ }),
    );
  }

  beforeEach(() => {
    usdaSearch.mockResolvedValue([gochujang]);
  });

  it("offers a 'Search USDA' action when the catalog comes up empty", async () => {
    const user = userEvent.setup();
    search.mockResolvedValue([]);
    renderWithUsda();

    await user.click(screen.getByLabelText("Change match for 1 tbsp gochujang"));
    await user.type(screen.getByRole("combobox"), "gochujang");

    expect(await screen.findByText("No catalog matches")).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: 'Search USDA for “gochujang”' }),
    ).toBeInTheDocument();
  });

  it("keeps the USDA action available below catalog matches — DB matches can be wrong", async () => {
    const user = userEvent.setup();
    search.mockResolvedValue([makeMatch("ing-1", "gochugaru", { similarity: 0.62 })]);
    renderWithUsda();

    await user.click(screen.getByLabelText("Change match for 1 tbsp gochujang"));
    await user.type(screen.getByRole("combobox"), "gochujang");

    // A (wrong-ish) catalog match AND the USDA escape hatch coexist.
    await screen.findByRole("option", { name: /gochugaru/ });
    await user.click(
      screen.getByRole("option", { name: 'Search USDA for “gochujang”' }),
    );

    // The pinned action survives the results — never displaced by them.
    const options = await screen.findAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      "gochugaru62%",
      "GOCHUJANG PASTEBranded",
      "Search USDA for “gochujang”",
    ]);
  });

  it("keeps the action pinned in the list before any query is typed (disabled)", async () => {
    const user = userEvent.setup();
    search.mockResolvedValue([]);
    renderWithUsda();

    await user.click(screen.getByLabelText("Change match for 1 tbsp gochujang"));

    const action = screen.getByRole("option", { name: "Search USDA…" });
    expect(action).toBeDisabled();

    await user.type(screen.getByRole("combobox"), "go");
    expect(
      await screen.findByRole("option", { name: 'Search USDA for “go”' }),
    ).toBeEnabled();
  });

  it("lists USDA candidates with provenance and imports the picked one", async () => {
    const user = userEvent.setup();
    search.mockResolvedValue([]);
    renderWithUsda();

    await openTypeAndSearchUsda(user);

    expect(usdaSearch).toHaveBeenCalledWith("gochujang");
    const usdaOption = await screen.findByRole("option", {
      name: /GOCHUJANG PASTE/,
    });
    expect(usdaOption).toHaveTextContent("Branded");

    await user.click(usdaOption);
    expect(onImportUsda).toHaveBeenCalledWith(gochujang);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("reaches the USDA action and results by keyboard", async () => {
    const user = userEvent.setup();
    search.mockResolvedValue([]);
    renderWithUsda();

    await user.click(screen.getByLabelText("Change match for 1 tbsp gochujang"));
    await user.type(screen.getByRole("combobox"), "gochujang");
    await screen.findByRole("option", { name: /Search USDA for/ });

    // The action is the only option — Enter runs the search…
    await user.keyboard("{Enter}");
    await screen.findByRole("option", { name: /GOCHUJANG PASTE/ });
    // …and its results take its place in the same keyboard cycle.
    await user.keyboard("{Enter}");
    expect(onImportUsda).toHaveBeenCalledWith(gochujang);
  });

  it("shows 'USDA search unavailable' when the proxy fails", async () => {
    const user = userEvent.setup();
    search.mockResolvedValue([]);
    usdaSearch.mockRejectedValue(new Error("502"));
    renderWithUsda();

    await openTypeAndSearchUsda(user);

    expect(await screen.findByText("USDA search unavailable")).toBeInTheDocument();
  });

  it("discards USDA results when the query changes", async () => {
    const user = userEvent.setup();
    search.mockResolvedValue([]);
    renderWithUsda();

    await openTypeAndSearchUsda(user);
    await screen.findByRole("option", { name: /GOCHUJANG PASTE/ });

    await user.type(screen.getByRole("combobox"), "x");

    expect(
      screen.queryByRole("option", { name: /GOCHUJANG PASTE/ }),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole("option", { name: /Search USDA for/ }),
    ).toBeInTheDocument();
  });

  it("renders no USDA affordance without an onImportUsda handler", async () => {
    const user = userEvent.setup();
    search.mockResolvedValue([]);
    renderClosed();

    await openAndType(user, "gochujang");

    expect(await screen.findByText("No catalog matches")).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /Search USDA/ }),
    ).not.toBeInTheDocument();
  });
});
