import { Redirect } from "expo-router";
import React from "react";

import { Loading } from "@/src/components/ui";
import { useAuth } from "@/src/state/AuthContext";

export default function Index() {
  const { ready, account, worldId } = useAuth();
  if (!ready) return <Loading />;
  if (!account) return <Redirect href="/login" />;
  if (!worldId) return <Redirect href="/worlds" />;
  return <Redirect href="/(tabs)/map" />;
}
