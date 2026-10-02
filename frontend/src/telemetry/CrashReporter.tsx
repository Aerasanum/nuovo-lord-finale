/**
 * Mounted once, renders nothing: installs the global error handler and keeps the current route where the crash
 * reporter can read it. A handler outside React cannot ask which screen the player was on, and "which screen" is
 * most of what makes a release crash findable.
 */
import { usePathname } from "expo-router";
import { useEffect } from "react";

import { installGlobalHandler, setRoute } from "@/src/telemetry/crash";

export function CrashReporter() {
  const pathname = usePathname();

  useEffect(() => {
    installGlobalHandler();
  }, []);

  useEffect(() => {
    setRoute(pathname);
  }, [pathname]);

  return null;
}
