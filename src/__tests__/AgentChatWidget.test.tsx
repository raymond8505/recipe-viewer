import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AgentChatWidget from "@/components/AgentChatWidget";

describe("AgentChatWidget", () => {
  it("renders the toggle button", () => {
    render(<AgentChatWidget />);
    expect(screen.getByRole("button", { name: /agent api/i })).toBeInTheDocument();
  });

  it("panel is hidden by default", () => {
    render(<AgentChatWidget />);
    expect(screen.queryByText(/not a chatbot/i)).not.toBeInTheDocument();
  });

  it("opens panel when toggle button is clicked", () => {
    render(<AgentChatWidget />);
    fireEvent.click(screen.getByRole("button", { name: /agent api/i }));
    expect(screen.getByText(/not a chatbot/i)).toBeInTheDocument();
  });

  it("panel mentions the window API", () => {
    render(<AgentChatWidget />);
    fireEvent.click(screen.getByRole("button", { name: /agent api/i }));
    expect(screen.getByText(/recipeTools/)).toBeInTheDocument();
  });

  it("closes panel when close button is clicked", () => {
    render(<AgentChatWidget />);
    fireEvent.click(screen.getByRole("button", { name: /agent api/i }));
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(screen.queryByText(/not a chatbot/i)).not.toBeInTheDocument();
  });

  it("toggle button has aria-expanded reflecting panel state", () => {
    render(<AgentChatWidget />);
    const btn = screen.getByRole("button", { name: /agent api/i });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
  });
});
