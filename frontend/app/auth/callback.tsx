import { Redirect } from "expo-router";
import React from "react";
import { View } from "react-native";

import { Loading } from "@/src/components/ui";
import { useAuth } from "@/src/state/AuthContext";

/** Legacy Google Auth redirect target. The session_id is consumed by AuthProvider on mount; this screen only gates. */
export default function AuthCallback() {
  const { ready, account } = useAuth();
  if (ready) return <Redirect href={account ? "/worlds" : "/login"} />;
  return (
    <View style={{ flex: 1 }} testID="auth-callback">
      <Loading />
    </View>
  );
}
