import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import * as Icons from "@/components/icons";
import { iconRegistry } from "@/components/icons/registry";
import { SpinnerIcon, SearchIcon, TrashIcon } from "@/components/icons";

/**
 * The Storybook table renders straight off `registry.ts`, so an icon that never
 * makes it into the registry is invisible there — exactly how the old hardcoded
 * grid lost track of ImageIcon and WarningIcon. These are the assertions that
 * actually fail when that happens.
 */
describe("icon registry", () => {
  const exported = Object.keys(Icons).sort();
  const registered = iconRegistry.map((entry) => entry.name).sort();

  it("covers every icon exported from the barrel", () => {
    expect(registered).toEqual(exported);
  });

  it("points every entry at the component the barrel exports", () => {
    for (const entry of iconRegistry) {
      expect(entry.component).toBe(Icons[entry.name]);
    }
  });
});

describe("icons", () => {
  it.each(iconRegistry)(
    "$name renders a lucide svg at its declared $size px default",
    ({ component: Icon, size }) => {
      const { container } = render(<Icon />);
      const svg = container.querySelector("svg");

      expect(svg).not.toBeNull();
      expect(svg!.getAttribute("class")).toContain("lucide");
      expect(svg!.getAttribute("width")).toBe(String(size));
      expect(svg!.getAttribute("height")).toBe(String(size));
    }
  );

  // Every icon is decorative — the accessible name comes from the button
  // wrapping it (see IconButton in buttons.test.tsx), never from the glyph.
  it.each(iconRegistry)("$name is hidden from assistive tech", ({ component: Icon }) => {
    const { container } = render(<Icon />);
    expect(container.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("merges a caller's className with the icon's own defaults", () => {
    // IngredientsTable passes only `animate-spin`; before the icons merged
    // classes this replaced the defaults and dropped the brand colour.
    const { container } = render(<SpinnerIcon className="animate-spin" />);
    const cls = container.querySelector("svg")!.getAttribute("class")!;

    expect(cls).toContain("text-brand");
    expect(cls).toContain("animate-spin");
  });

  it("lets a caller's colour beat the icon's default colour", () => {
    // SearchBar swaps the muted grey for brand while a search is pending.
    const { container } = render(<SearchIcon className="text-brand" />);
    const cls = container.querySelector("svg")!.getAttribute("class")!;

    expect(cls).toContain("text-brand");
    expect(cls).not.toContain("text-gray-400");
  });

  it("forwards arbitrary svg props", () => {
    const { container } = render(<TrashIcon size={24} data-testid="trash" />);
    const svg = container.querySelector("svg")!;

    expect(svg.getAttribute("width")).toBe("24");
    expect(svg.getAttribute("data-testid")).toBe("trash");
  });
});
