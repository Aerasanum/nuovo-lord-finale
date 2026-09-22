// One QueryClient for the whole app; the provider in app/_layout.tsx uses
// this instance. Import it for cache calls outside components, for example
// queryClient.invalidateQueries or setQueryData in websocket or push
// handlers; inside components useQueryClient() returns this same instance.
import { focusManager, QueryClient } from "@tanstack/react-query";
import { AppState, Platform } from "react-native";

import { ApiError, isUnreachable } from "@/src/api/client";

// React Query decides whether the app is "in the background" from a browser visibilitychange listener. On a
// device there is no document, so it considers the app focused forever and the two dozen polling queries keep
// hitting the server while the game sits behind the home screen. AppState is the native equivalent.
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => focusManager.setFocused(state === "active"));
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Polling is how the client follows a server-authoritative world; stop it while nobody is looking.
      refetchIntervalInBackground: false,
      // A rejected command (not enough resources, queue full, …) is an answer, not a hiccup: retrying it three
      // times only delays the error the screen is about to show. Transport and server faults are worth a retry.
      retry: (attempt, error) => attempt < 2 && (!(error instanceof ApiError) || isUnreachable(error) || error.status >= 500),
    },
  },
});
