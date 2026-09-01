import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  ChatBubbleIcon,
  ChefHatIcon,
  CheckIcon,
  CloseIcon,
  CloseSmallIcon,
  CopyIcon,
  DragHandleIcon,
  EditIcon,
  EnterFullscreenIcon,
  ExitFullscreenIcon,
  ExternalLinkIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  ResetIcon,
  SearchIcon,
  SmallPlusIcon,
  SpinnerIcon,
  TrashIcon,
} from "@/components/icons";

const meta: Meta = {
  title: "Components/Icons",
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof meta>;

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-100 bg-card">
      <div className="flex items-center justify-center w-10 h-10 text-gray-700">
        {children}
      </div>
      <span className="text-xs text-gray-400 text-center leading-tight">{label}</span>
    </div>
  );
}

export const AllIcons: Story = {
  render: () => (
    <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
      <Cell label="ChatBubble"><ChatBubbleIcon /></Cell>
      <Cell label="ChefHat"><ChefHatIcon /></Cell>
      <Cell label="Check"><CheckIcon /></Cell>
      <Cell label="Check (sm)"><CheckIcon size={12} /></Cell>
      <Cell label="Close"><CloseIcon /></Cell>
      <Cell label="CloseSmall"><CloseSmallIcon /></Cell>
      <Cell label="Copy"><CopyIcon /></Cell>
      <Cell label="DragHandle"><DragHandleIcon /></Cell>
      <Cell label="Edit"><EditIcon /></Cell>
      <Cell label="EnterFullscreen"><EnterFullscreenIcon /></Cell>
      <Cell label="ExitFullscreen"><ExitFullscreenIcon /></Cell>
      <Cell label="ExternalLink"><ExternalLinkIcon /></Cell>
      <Cell label="Pause"><PauseIcon /></Cell>
      <Cell label="Play"><PlayIcon /></Cell>
      <Cell label="Play dimmed"><PlayIcon dimmed /></Cell>
      <Cell label="Plus"><PlusIcon /></Cell>
      <Cell label="Reset"><ResetIcon /></Cell>
      <Cell label="Search"><SearchIcon /></Cell>
      <Cell label="SmallPlus"><SmallPlusIcon /></Cell>
      <Cell label="Spinner"><SpinnerIcon /></Cell>
      <Cell label="Trash"><TrashIcon /></Cell>
    </div>
  ),
};
