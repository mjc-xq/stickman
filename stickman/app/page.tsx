import { StickmanProvider } from "./hooks/stickman";
import { IMUVisualizer } from "./components/IMUVisualizer";

export default function Home() {
  return (
    <StickmanProvider>
      <IMUVisualizer />
    </StickmanProvider>
  );
}
