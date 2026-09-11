import React, { useEffect, useState } from "react";
import { Pressable } from "react-native";

import { serverNow } from "@/src/api/client";
import { type JobDto, useDaily, useDailyMutations } from "@/src/api/hooks";
import { useToast } from "@/src/components/overlay";
import { Icon, T } from "@/src/components/ui";
import { fmt, useI18n } from "@/src/i18n";
import { useGame } from "@/src/state/useGame";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  btn: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 32, paddingHorizontal: spacing.sm, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.success },
}));

/** "⏩ 30 min" pill: spends banked daily speed-up minutes (min(bank, remaining)) on a RUNNING job. Hidden when the
 * bank is empty; the server re-validates and completes the job through the scheduler's own handler. */
export function SpeedupButton({ job }: { job: JobDto }) {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const { worldId } = useGame();
  const daily = useDaily(worldId);
  const m = useDailyMutations(worldId ?? "");
  const { show, showError } = useToast();
  const [now, setNow] = useState(serverNow());
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), 1000);
    return () => clearInterval(id);
  }, []);
  const bank = daily.data?.speedup_minutes ?? 0;
  if (!bank || job.status !== "RUNNING") return null;
  const remaining = Math.max(1, Math.ceil((Date.parse(job.ends_at) - now) / 60000));
  const use = Math.min(bank, remaining);
  return (
    <Pressable
      style={s.btn}
      disabled={m.speedup.isPending}
      onPress={() =>
        m.speedup
          .mutateAsync({ jobId: job.job_id, minutes: use })
          .then((r) => show(fmt(t("speedupApplied"), { minutes: r.spent_minutes }), "success"))
          .catch(showError)
      }
      accessibilityLabel={`${t("speedupUse")} ${use} ${t("minutesShort")}`}
      testID={`job-${job.job_id}-speedup`}
    >
      <Icon name="fast-forward" size={14} color={colors.success} />
      <T v="caption" style={{ color: colors.onSurface, fontWeight: "700" }}>
        {use} {t("minutesShort")}
      </T>
    </Pressable>
  );
}
