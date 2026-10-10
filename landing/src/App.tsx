import { MotionConfig } from "motion/react";
import { Nav } from "./components/Nav";
import { Hero } from "./sections/Hero";
import { HowItWorks } from "./sections/HowItWorks";
import { Playground } from "./sections/Playground";
import { FinalCta } from "./sections/FinalCta";
import { Footer } from "./sections/Footer";

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <Nav />
      <main>
        <Hero />
        <HowItWorks />
        <Playground />
        <FinalCta />
      </main>
      <Footer />
    </MotionConfig>
  );
}
