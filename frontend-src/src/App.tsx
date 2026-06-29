import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SynoraProvider, useStore } from "./lib/store";
import type { ViewKey } from "./lib/types";
import { Ambient } from "./components/Ambient";
import { Rail } from "./components/Rail";
import { Toast } from "./components/ui";
import { viewSwap } from "./motion/variants";

import { Observe } from "./views/Observe";
import { Minds } from "./views/Minds";
import { Constellation } from "./views/Constellation";
import { Memory } from "./views/Memory";
import { Canon } from "./views/Canon";
import { Engine } from "./views/Engine";

const VIEWS: Record<ViewKey, () => JSX.Element> = {
  observe: Observe,
  minds: Minds,
  constellation: Constellation,
  memory: Memory,
  canon: Canon,
  engine: Engine,
};

function Shell() {
  const store = useStore();
  const [view, setView] = useState<ViewKey>("observe");
  const [guided, setGuided] = useState(false);

  // first run with no key → surface the engine once (no prose, just routing)
  useEffect(() => {
    if (store.ready && store.config && !store.config.has_deepseek_key && !guided) {
      setView("engine");
      setGuided(true);
    }
  }, [store.ready, store.config, guided]);

  const Current = VIEWS[view];
  const live = store.engineMode !== "idle";

  return (
    <div style={{ display: "flex", height: "100vh", position: "relative", overflow: "hidden" }}>
      <Ambient />
      <Rail active={view} onChange={setView} live={live} />
      <main style={{ flex: 1, position: "relative", zIndex: 1, overflow: "hidden", minWidth: 0 }}>
        <AnimatePresence mode="wait">
          <motion.div key={view} variants={viewSwap} initial="initial" animate="animate" exit="exit"
            style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
            <Current />
          </motion.div>
        </AnimatePresence>
      </main>
      <Toast toast={store.toast} />
    </div>
  );
}

export function App() {
  return (
    <SynoraProvider>
      <Shell />
    </SynoraProvider>
  );
}
