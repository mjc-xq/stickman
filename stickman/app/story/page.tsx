import { StickmanProvider } from "@/app/hooks/stickman";
import { Fredoka } from "next/font/google";
import { StoryView } from "./StoryView";

const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export default function StoryPage() {
  return (
    <StickmanProvider>
      <div className={fredoka.variable}>
        <StoryView />
      </div>
    </StickmanProvider>
  );
}
