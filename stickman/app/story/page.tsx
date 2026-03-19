import { StickmanProvider } from "@/app/hooks/stickman";
import { StoryView } from "./StoryView";

export default function StoryPage() {
  return (
    <StickmanProvider>
      <StoryView />
    </StickmanProvider>
  );
}
