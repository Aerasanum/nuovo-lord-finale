import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleProp, View, ViewStyle } from "react-native";
import Animated, { FadeInDown, FadeOutDown, SlideInDown, SlideOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError } from "@/src/api/client";
import { API_ERRORS, useI18n } from "@/src/i18n";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

import { Icon, T } from "./ui";

// --------------------------------------------------------------------------------------------- toast
type Toast = { id: number; message: string; kind: "info" | "error" | "success" };
const ToastCtx = createContext<{ show: (m: string, kind?: Toast["kind"]) => void; showError: (e: unknown) => void }>({ show: () => {}, showError: () => {} });

const useToastStyles = makeStyles((c) => ({
  host: { position: "absolute", left: spacing.md, right: spacing.md, alignItems: "center", gap: spacing.sm },
  toast: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: c.surfaceInverse, paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.md, maxWidth: 520 },
  text: { color: c.onSurfaceInverse, fontSize: 13, flexShrink: 1 },
  error: { backgroundColor: c.error },
  errorText: { color: c.onError },
  success: { backgroundColor: c.success },
  successText: { color: c.onSuccess },
}));

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const insets = useSafeAreaInsets();
  const s = useToastStyles();
  const { colors } = useTheme();
  const { lang } = useI18n();
  const show = useCallback((message: string, kind: Toast["kind"] = "info") => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-2), { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  const showError = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError) {
        const detail = e.details?.missing ? ` (${Object.entries(e.details.missing as Record<string, number>).map(([k, v]) => `${k} -${v}`).join(", ")})` : "";
        const human = API_ERRORS[lang][e.code];
        show(human ? `${human}${detail}` : `${e.code}: ${e.message}${detail}`, "error");
      } else show(String((e as Error)?.message || e), "error");
    },
    [show, lang],
  );
  const value = useMemo(() => ({ show, showError }), [show, showError]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <View style={[s.host, { top: insets.top + 8, pointerEvents: "none" }]}>
        {toasts.map((t) => (
          <Animated.View key={t.id} entering={FadeInDown} exiting={FadeOutDown} style={[s.toast, t.kind === "error" && s.error, t.kind === "success" && s.success]} testID={`toast-${t.kind}`}>
            <Icon name={t.kind === "error" ? "alert-circle" : t.kind === "success" ? "check-circle" : "information"} size={16} color={t.kind === "error" ? colors.onError : t.kind === "success" ? colors.onSuccess : colors.onSurfaceInverse} />
            <T style={[s.text, t.kind === "error" && s.errorText, t.kind === "success" && s.successText]}>{t.message}</T>
          </Animated.View>
        ))}
      </View>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// --------------------------------------------------------------------------------------------- bottom sheet
const useSheetStyles = makeStyles((c) => ({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { backgroundColor: c.surfaceSecondary, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTopWidth: 1, borderColor: c.borderStrong, maxHeight: "88%" },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: c.borderStrong, marginTop: 8 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  body: { paddingHorizontal: spacing.md, gap: spacing.sm },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
}));

export function Sheet({ visible, onClose, title, children, footer, testID }: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode; footer?: React.ReactNode; testID?: string }) {
  const s = useSheetStyles();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={s.backdrop} onPress={onClose} testID={`${testID ?? "sheet"}-backdrop`}>
        <Animated.View entering={SlideInDown.springify().damping(24)} exiting={SlideOutDown} style={s.sheet} testID={testID}>
          <Pressable onPress={() => {}} style={{ paddingBottom: Math.max(insets.bottom, spacing.md) }}>
            <View style={s.handle} />
            <View style={s.header}>
              <T v="title" numberOfLines={1} style={{ flex: 1 }}>
                {title ?? ""}
              </T>
              <Pressable onPress={onClose} style={s.close} testID={`${testID ?? "sheet"}-close`}>
                <Icon name="close" size={22} color={colors.onSurfaceSecondary} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
            {footer ? <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm }}>{footer}</View> : null}
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

// --------------------------------------------------------------------------------------------- screen scaffold
const useScreenStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.divider, flexDirection: "row", alignItems: "center", gap: spacing.sm },
}));
export function Screen({ children, title, left, right, style, header, testID }: { children: React.ReactNode; title?: string; left?: React.ReactNode; right?: React.ReactNode; style?: StyleProp<ViewStyle>; header?: React.ReactNode; testID?: string }) {
  const s = useScreenStyles();
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.root, style]} testID={testID}>
      {title !== undefined || header ? (
        <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
          {left}
          {title !== undefined ? (
            <T v="title" style={{ flex: 1 }} numberOfLines={1}>
              {title}
            </T>
          ) : null}
          {header}
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}
